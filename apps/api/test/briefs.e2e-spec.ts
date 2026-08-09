import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { randomUUID } from "crypto";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { ModelRouterService } from "../src/ai/model-router.service";
import { GenerationRequest, GenerationStream, GenerationUsage } from "../src/ai/model-router.types";

/**
 * A fake ModelRouterService swapped in via .overrideProvider() -- these
 * tests never call the real Anthropic/Gemini APIs (no cost, no network
 * flakiness, no real credentials needed in CI). `model`/`provider` here
 * deliberately reuse a real pricing-table entry ("claude-opus-5") so
 * BriefsService's actualCostMicros() calculation doesn't throw on an
 * unregistered model id -- see src/ai/model-pricing.ts.
 */
class FakeModelRouter implements Pick<ModelRouterService, "primaryModel" | "generate"> {
  readonly primaryModel = "claude-opus-5";
  behavior: "success" | "fail-midstream" = "success";
  deltas = ["Hello", " world"];
  failError: unknown = new Error("stubbed mid-stream failure");
  generate = jest.fn((_request: GenerationRequest): GenerationStream => {
    // Captured because the nested `function*` below is not an arrow
    // function -- it has its own `this` binding, so the class instance
    // must be bridged in via a closure variable instead.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    async function* textDeltas() {
      for (const d of self.deltas) yield d;
      if (self.behavior === "fail-midstream") throw self.failError;
    }
    return {
      textDeltas: textDeltas(),
      usage: async (): Promise<GenerationUsage> => ({
        provider: "test-stub",
        model: self.primaryModel,
        inputTokens: 12,
        outputTokens: self.deltas.join("").length,
      }),
    };
  });
}

/**
 * Full HTTP black-box coverage of the brief -> AI draft -> approve loop,
 * complementing model-router.service.spec.ts (fallback logic in isolation)
 * and credit-ledger.e2e-spec.ts (ledger correctness/concurrency). Requires
 * the same running Postgres as the other *.e2e-spec.ts files.
 */
describe("Briefs + generation (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let fakeRouter: FakeModelRouter;

  beforeAll(async () => {
    fakeRouter = new FakeModelRouter();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ModelRouterService)
      .useValue(fakeRouter)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    fakeRouter.behavior = "success";
    fakeRouter.deltas = ["Hello", " world"];
    fakeRouter.generate.mockClear();
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

  async function createBrief(token: string) {
    const project = await request(app.getHttpServer())
      .post("/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Test project" })
      .expect(201);

    const brief = await request(app.getHttpServer())
      .post("/briefs")
      .set("Authorization", `Bearer ${token}`)
      .send({ projectId: project.body.id, title: "Ad copy", instructions: "Write something." })
      .expect(201);

    return brief.body as { id: string; taskId: string };
  }

  it("a brief created by tenant A is invisible to tenant B", async () => {
    const a = await signup();
    const b = await signup();
    const brief = await createBrief(a.token);

    const listAsB = await request(app.getHttpServer())
      .get("/briefs")
      .set("Authorization", `Bearer ${b.token}`)
      .expect(200);
    expect(listAsB.body.find((x: any) => x.id === brief.id)).toBeUndefined();

    await request(app.getHttpServer())
      .get(`/briefs/${brief.id}`)
      .set("Authorization", `Bearer ${b.token}`)
      .expect(404);
  });

  it("a successful generation streams text and persists the expected side effects", async () => {
    const { token, organizationId } = await signup();
    await grantCredit(organizationId, 100_000_000);
    const { id: briefId, taskId } = await createBrief(token);
    fakeRouter.deltas = ["Hello", " world"];

    const res = await request(app.getHttpServer())
      .get(`/briefs/${briefId}/generate`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.text).toContain("Hello");
    expect(res.text).toContain(" world");
    expect(res.text).toContain("event: done");

    const [task, assets, job] = await prisma.runAsTenant(organizationId, (tx) =>
      Promise.all([
        tx.task.findUniqueOrThrow({ where: { id: taskId } }),
        tx.asset.findMany({ where: { taskId } }),
        tx.generationJob.findFirstOrThrow({ where: { taskId }, orderBy: { createdAt: "desc" } }),
      ]),
    );

    expect(task.status).toBe("IN_REVIEW");
    expect(assets).toHaveLength(1);
    expect(assets[0].content).toBe("Hello world");
    expect(assets[0].version).toBe(1);
    expect(job.status).toBe("COMPLETED");
    expect(job.provider).toBe("test-stub");
    expect(job.promptTokens).toBe(12);
    expect(job.completionTokens).toBe("Hello world".length);

    const ledgerEntry = await prisma.runAsTenant(organizationId, (tx) =>
      tx.creditLedgerEntry.findFirstOrThrow({ where: { generationJobId: job.id } }),
    );
    expect(ledgerEntry.status).toBe("SETTLED");
    expect(ledgerEntry.amountMicros).toBe(-(job.actualCostMicros ?? NaN));
  });

  it("reports insufficient credit as an SSE error event and never calls the model", async () => {
    const { token, organizationId } = await signup(); // no grantCredit -- balance is 0
    const { id: briefId, taskId } = await createBrief(token);

    // Not a 402 -- see the long comment on BriefsService.generateStream for
    // why every failure from this SSE endpoint is an `event: error` message
    // at HTTP 200, never a distinct error status.
    const res = await request(app.getHttpServer())
      .get(`/briefs/${briefId}/generate`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.text).toContain("event: error");
    expect(res.text).toContain("Insufficient credit");

    expect(fakeRouter.generate).not.toHaveBeenCalled();

    const [task, assets, job] = await prisma.runAsTenant(organizationId, (tx) =>
      Promise.all([
        tx.task.findUniqueOrThrow({ where: { id: taskId } }),
        tx.asset.findMany({ where: { taskId } }),
        tx.generationJob.findFirstOrThrow({ where: { taskId }, orderBy: { createdAt: "desc" } }),
      ]),
    );
    expect(task.status).toBe("TODO");
    expect(assets).toHaveLength(0);
    expect(job.status).toBe("FAILED");
    expect(job.errorMessage).toBe("insufficient_credit");
  });

  it("a mid-stream failure releases the credit hold and never approves the task", async () => {
    const { token, organizationId } = await signup();
    await grantCredit(organizationId, 100_000_000);
    const { id: briefId, taskId } = await createBrief(token);
    fakeRouter.behavior = "fail-midstream";
    fakeRouter.deltas = ["partial"];

    const res = await request(app.getHttpServer())
      .get(`/briefs/${briefId}/generate`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200); // SSE headers are already committed before the failure -- HTTP status stays 200

    expect(res.text).toContain("event: error");

    const [task, assets, job] = await prisma.runAsTenant(organizationId, (tx) =>
      Promise.all([
        tx.task.findUniqueOrThrow({ where: { id: taskId } }),
        tx.asset.findMany({ where: { taskId } }),
        tx.generationJob.findFirstOrThrow({ where: { taskId }, orderBy: { createdAt: "desc" } }),
      ]),
    );
    expect(task.status).toBe("TODO");
    expect(assets).toHaveLength(0);
    expect(job.status).toBe("FAILED");

    const ledgerEntry = await prisma.runAsTenant(organizationId, (tx) =>
      tx.creditLedgerEntry.findFirstOrThrow({ where: { generationJobId: job.id } }),
    );
    expect(ledgerEntry.amountMicros).toBe(0);
    expect(ledgerEntry.status).toBe("SETTLED");
  });
});
