import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { IoAdapter } from "@nestjs/platform-socket.io";
import request from "supertest";
import { randomUUID } from "crypto";
import { AddressInfo } from "net";
import { io, Socket } from "socket.io-client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { GeminiImageProvider } from "../src/ai/providers/gemini-image.provider";

// Smallest possible valid PNG (1x1 transparent) -- just needs to be bytes
// LocalImageStorageService can write to disk, content doesn't matter here.
const FAKE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

class FakeImageProvider implements Pick<GeminiImageProvider, "name" | "model" | "isConfigured" | "generateImage"> {
  readonly name = "gemini";
  readonly model = "gemini-3.1-flash-image";
  isConfigured = true;
  behavior: "success" | "fail" = "success";
  generateImage = jest.fn(async () => {
    if (this.behavior === "fail") throw new Error("stubbed image gen failure");
    return { base64: FAKE_PNG_BASE64, mimeType: "image/png" };
  });
}

/**
 * Exercises the full async path: POST /briefs/:id/generate-image -> BullMQ
 * job -> ImageGenerationProcessor -> WebSocket job:update -- not just the
 * enqueue response, since the enqueue response deliberately carries no
 * result (see BriefsService.generateImage's comment on why this is 202,
 * not 201). Requires real Postgres + Redis (same docker-compose as the
 * other *.e2e-spec.ts files) -- BullMQ needs a live Redis to actually run
 * the worker, this can't be faked away like the DB-less *.spec.ts tests.
 */
describe("Image generation (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fakeImageProvider: FakeImageProvider;
  let baseUrl: string;

  beforeAll(async () => {
    fakeImageProvider = new FakeImageProvider();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GeminiImageProvider)
      .useValue(fakeImageProvider)
      .compile();

    app = moduleRef.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    // Actually listen (unlike the other e2e specs' app.init()) -- the
    // socket.io client needs a real address to connect to.
    await app.listen(0);
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    fakeImageProvider.behavior = "success";
    fakeImageProvider.generateImage.mockClear();
  });

  async function signup() {
    const email = `${randomUUID()}@test.local`;
    const res = await request(app.getHttpServer())
      .post("/auth/signup")
      .send({ orgName: `Org ${email}`, adminName: "Admin", email, password: "password123" })
      .expect(201);
    const token = res.body.accessToken as string;

    const me = await request(app.getHttpServer())
      .get("/organizations/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    return { token, organizationId: me.body.id as string };
  }

  async function grantCredit(organizationId: string, amountMicros: number) {
    await prisma.runAsTenant(organizationId, (tx) =>
      tx.creditLedgerEntry.create({ data: { organizationId, amountMicros, reason: "test_grant" } }),
    );
  }

  async function createBrief(token: string, type: "DESIGN" | "WEBSITE") {
    const project = await request(app.getHttpServer())
      .post("/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Test project" })
      .expect(201);

    const context =
      type === "DESIGN"
        ? { designType: "Poster", purpose: "Ramadan promo", keyMessage: "30% off all pastries" }
        : { businessType: "Bakery", targetAudience: "Families", painPoints: "No site", goals: "Simple site" };

    const brief = await request(app.getHttpServer())
      .post("/briefs")
      .set("Authorization", `Bearer ${token}`)
      .send({ projectId: project.body.id, title: "Test brief", type, context })
      .expect(201);

    return brief.body as { id: string; taskId: string };
  }

  function connectSocket(token: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = io(baseUrl, { auth: { token }, transports: ["websocket"] });
      socket.on("connect", () => resolve(socket));
      socket.on("connect_error", reject);
    });
  }

  it("generates an image end-to-end and notifies over WebSocket", async () => {
    const { token, organizationId } = await signup();
    await grantCredit(organizationId, 100_000_000);
    const { id: briefId, taskId } = await createBrief(token, "DESIGN");

    const socket = await connectSocket(token);
    const completed = new Promise<any>((resolve) => {
      socket.on("job:update", (payload) => {
        if (payload.status === "COMPLETED" || payload.status === "FAILED") resolve(payload);
      });
    });

    const res = await request(app.getHttpServer())
      .post(`/briefs/${briefId}/generate-image`)
      .set("Authorization", `Bearer ${token}`)
      .expect(202);
    const jobId = res.body.jobId as string;
    expect(jobId).toBeTruthy();

    const finalUpdate = await completed;
    socket.disconnect();

    expect(finalUpdate.status).toBe("COMPLETED");
    expect(finalUpdate.briefId).toBe(briefId);
    expect(finalUpdate.assetUrl).toMatch(/^\/generated\//);
    expect(fakeImageProvider.generateImage).toHaveBeenCalledTimes(1);

    const [asset, job] = await prisma.runAsTenant(organizationId, (tx) =>
      Promise.all([
        tx.asset.findFirstOrThrow({ where: { taskId } }),
        tx.generationJob.findUniqueOrThrow({ where: { id: jobId } }),
      ]),
    );
    expect(asset.type).toBe("IMAGE");
    expect(asset.storagePath).toBeTruthy();
    expect(job.status).toBe("COMPLETED");
    expect(job.actualCostMicros).toBe(67_000);

    const ledgerEntry = await prisma.runAsTenant(organizationId, (tx) =>
      tx.creditLedgerEntry.findFirstOrThrow({ where: { generationJobId: jobId } }),
    );
    expect(ledgerEntry.status).toBe("SETTLED");
    expect(ledgerEntry.amountMicros).toBe(-67_000);
  }, 15000);

  it("returns 402 for insufficient credit and never calls the image provider", async () => {
    const { token } = await signup(); // no grantCredit -- balance is 0
    const { id: briefId } = await createBrief(token, "DESIGN");

    await request(app.getHttpServer())
      .post(`/briefs/${briefId}/generate-image`)
      .set("Authorization", `Bearer ${token}`)
      .expect(402);

    expect(fakeImageProvider.generateImage).not.toHaveBeenCalled();
  });

  it("rejects image generation for a WEBSITE brief with 400", async () => {
    const { token, organizationId } = await signup();
    await grantCredit(organizationId, 100_000_000);
    const { id: briefId } = await createBrief(token, "WEBSITE");

    await request(app.getHttpServer())
      .post(`/briefs/${briefId}/generate-image`)
      .set("Authorization", `Bearer ${token}`)
      .expect(400);

    expect(fakeImageProvider.generateImage).not.toHaveBeenCalled();
  });

  it("a failed generation releases the credit hold and marks the job FAILED", async () => {
    const { token, organizationId } = await signup();
    await grantCredit(organizationId, 100_000_000);
    const { id: briefId } = await createBrief(token, "DESIGN");
    fakeImageProvider.behavior = "fail";

    const socket = await connectSocket(token);
    const completed = new Promise<any>((resolve) => {
      socket.on("job:update", (payload) => {
        if (payload.status === "FAILED") resolve(payload);
      });
    });

    const res = await request(app.getHttpServer())
      .post(`/briefs/${briefId}/generate-image`)
      .set("Authorization", `Bearer ${token}`)
      .expect(202);
    const jobId = res.body.jobId as string;

    await completed;
    socket.disconnect();

    const job = await prisma.runAsTenant(organizationId, (tx) =>
      tx.generationJob.findUniqueOrThrow({ where: { id: jobId } }),
    );
    expect(job.status).toBe("FAILED");

    const ledgerEntry = await prisma.runAsTenant(organizationId, (tx) =>
      tx.creditLedgerEntry.findFirstOrThrow({ where: { generationJobId: jobId } }),
    );
    expect(ledgerEntry.amountMicros).toBe(0);
    expect(ledgerEntry.status).toBe("SETTLED");
  }, 15000);
});
