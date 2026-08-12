import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { randomUUID } from "crypto";
import * as argon2 from "argon2";
import { Role } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { ModelRouterService } from "../src/ai/model-router.service";
import { GenerationRequest, GenerationStream, GenerationUsage } from "../src/ai/model-router.types";

/** Same fake used by briefs.e2e-spec.ts -- never hit the real Anthropic/Gemini APIs from a test. */
class FakeModelRouter implements Pick<ModelRouterService, "primaryModel" | "generate"> {
  readonly primaryModel = "claude-opus-5";
  response = '{"priceIdr": 5000000, "reasoning": "Kompleksitas sedang, sesuai tarif pasar."}';
  generate = jest.fn((_request: GenerationRequest): GenerationStream => {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    async function* textDeltas() {
      yield self.response;
    }
    return {
      textDeltas: textDeltas(),
      usage: async (): Promise<GenerationUsage> => ({
        provider: "test-stub",
        model: self.primaryModel,
        inputTokens: 20,
        outputTokens: self.response.length,
      }),
    };
  });
}

/**
 * Client portal flow: staff provisions a client login -> client submits a
 * brief -> staff gets an AI price suggestion -> staff sends an invoice ->
 * client claims a DP payment with proof -> staff verifies it. Each step
 * checks the role boundary as well as the happy path, since this whole
 * feature exists specifically to let CLIENT_APPROVER act for themselves.
 */
describe("Client portal flow (e2e)", () => {
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
    fakeRouter.response = '{"priceIdr": 5000000, "reasoning": "Kompleksitas sedang, sesuai tarif pasar."}';
    fakeRouter.generate.mockClear();
  });

  async function signup() {
    const email = `${randomUUID()}@test.local`;
    const res = await request(app.getHttpServer())
      .post("/auth/signup")
      .send({ orgName: `Org ${email}`, adminName: "Admin", email, password: "password123" })
      .expect(201);
    return res.body.accessToken as string;
  }

  async function signupWithRole(role: Role) {
    const adminToken = await signup();
    const me = await request(app.getHttpServer())
      .get("/organizations/me")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200);
    const organizationId = me.body.id as string;

    const email = `${randomUUID()}@test.local`;
    const passwordHash = await argon2.hash("password123");
    const user = await prisma.runAsTenant(organizationId, (tx) =>
      tx.user.create({ data: { organizationId, email, passwordHash, name: `A ${role}`, role } }),
    );
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email, password: "password123" })
      .expect(201);

    return { adminToken, token: login.body.accessToken as string, organizationId, userId: user.id };
  }

  /** Staff-created projects have no clientOwnerId by default -- tests that need a CLIENT_* role to actually access one must assign it first. */
  function assignClient(adminToken: string, projectId: string, clientUserId: string) {
    return request(app.getHttpServer())
      .patch(`/projects/${projectId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ clientOwnerId: clientUserId })
      .expect(200);
  }

  async function grantCredit(organizationId: string, amountMicros: number) {
    await prisma.runAsTenant(organizationId, (tx) =>
      tx.creditLedgerEntry.create({ data: { organizationId, amountMicros, reason: "test_grant" } }),
    );
  }

  async function createProject(token: string) {
    const res = await request(app.getHttpServer())
      .post("/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Test project" })
      .expect(201);
    return res.body as { id: string };
  }

  async function createBrief(token: string, projectId: string) {
    const res = await request(app.getHttpServer())
      .post("/briefs")
      .set("Authorization", `Bearer ${token}`)
      .send({
        projectId,
        title: "Company site",
        type: "WEBSITE",
        context: {
          businessType: "Local bakery",
          targetAudience: "Neighborhood families",
          painPoints: "No online presence",
          goals: "Simple site with menu and location",
        },
      })
      .expect(201);
    return res.body as { id: string };
  }

  describe("POST /users -- client account provisioning", () => {
    it("AGENCY_ADMIN creates a CLIENT_APPROVER login that can actually log in, password shown once", async () => {
      const adminToken = await signup();

      const res = await request(app.getHttpServer())
        .post("/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ email: `${randomUUID()}@test.local`, name: "Klien Approver", role: "CLIENT_APPROVER" })
        .expect(201);

      expect(res.body.role).toBe("CLIENT_APPROVER");
      expect(typeof res.body.temporaryPassword).toBe("string");
      expect(res.body.temporaryPassword.length).toBeGreaterThan(6);

      await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: res.body.email, password: res.body.temporaryPassword })
        .expect(201);
    });

    it("AGENCY_EDITOR cannot provision a client login -- admin-only", async () => {
      const { token: editorToken } = await signupWithRole(Role.AGENCY_EDITOR);
      await request(app.getHttpServer())
        .post("/users")
        .set("Authorization", `Bearer ${editorToken}`)
        .send({ email: `${randomUUID()}@test.local`, name: "X", role: "CLIENT_VIEWER" })
        .expect(403);
    });

    it("rejects an agency role -- this endpoint only invites CLIENT_APPROVER/CLIENT_VIEWER", async () => {
      const adminToken = await signup();
      await request(app.getHttpServer())
        .post("/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ email: `${randomUUID()}@test.local`, name: "X", role: "AGENCY_ADMIN" })
        .expect(400);
    });

    it("rejects a duplicate email with 409", async () => {
      const adminToken = await signup();
      const email = `${randomUUID()}@test.local`;
      await request(app.getHttpServer())
        .post("/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ email, name: "First", role: "CLIENT_VIEWER" })
        .expect(201);
      await request(app.getHttpServer())
        .post("/users")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ email, name: "Second", role: "CLIENT_VIEWER" })
        .expect(409);
    });
  });

  describe("brief submission by a client", () => {
    it("CLIENT_APPROVER can submit a brief", async () => {
      const { adminToken, token: approverToken, userId } = await signupWithRole(Role.CLIENT_APPROVER);
      const project = await createProject(adminToken);
      await assignClient(adminToken, project.id, userId);
      await createBrief(approverToken, project.id);
    });

    it("CLIENT_VIEWER cannot -- viewing is not deciding", async () => {
      const { adminToken, token: viewerToken } = await signupWithRole(Role.CLIENT_VIEWER);
      const project = await createProject(adminToken);
      await request(app.getHttpServer())
        .post("/briefs")
        .set("Authorization", `Bearer ${viewerToken}`)
        .send({
          projectId: project.id,
          title: "X",
          type: "WEBSITE",
          context: {
            businessType: "A",
            targetAudience: "B",
            painPoints: "C",
            goals: "D",
          },
        })
        .expect(403);
    });
  });

  describe("POST /briefs/:id/suggest-price", () => {
    it("staff gets an AI suggestion that persists onto the brief; a client cannot trigger it", async () => {
      const { adminToken, token: approverToken, organizationId } = await signupWithRole(Role.CLIENT_APPROVER);
      await grantCredit(organizationId, 100_000_000);
      const project = await createProject(adminToken);
      const brief = await createBrief(adminToken, project.id);

      await request(app.getHttpServer())
        .post(`/briefs/${brief.id}/suggest-price`)
        .set("Authorization", `Bearer ${approverToken}`)
        .expect(403);

      const res = await request(app.getHttpServer())
        .post(`/briefs/${brief.id}/suggest-price`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(201);
      expect(res.body).toMatchObject({ priceIdr: 5_000_000 });
      expect(res.body.reasoning).toMatch(/pasar/);

      const stored = await prisma.runAsTenant(organizationId, (tx) =>
        tx.brief.findUniqueOrThrow({ where: { id: brief.id } }),
      );
      expect(stored.aiSuggestedPriceIdr).toBe(5_000_000);
      expect(stored.aiPriceReasoning).toMatch(/pasar/);
    });

    it("fails loudly (502) on a malformed AI response instead of storing garbage", async () => {
      const adminToken = await signup();
      const me = await request(app.getHttpServer())
        .get("/organizations/me")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      await grantCredit(me.body.id, 100_000_000);
      const project = await createProject(adminToken);
      const brief = await createBrief(adminToken, project.id);

      fakeRouter.response = "this is not json";
      await request(app.getHttpServer())
        .post(`/briefs/${brief.id}/suggest-price`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(502);

      const stored = await prisma.runAsTenant(me.body.id, (tx) =>
        tx.brief.findUniqueOrThrow({ where: { id: brief.id } }),
      );
      expect(stored.aiSuggestedPriceIdr).toBeNull();
    });
  });

  describe("invoices", () => {
    it("staff sending an invoice sets the project's price + min DP; a client cannot send one", async () => {
      const { adminToken, token: approverToken, userId } = await signupWithRole(Role.CLIENT_APPROVER);
      const project = await createProject(adminToken);
      await assignClient(adminToken, project.id, userId);

      await request(app.getHttpServer())
        .post(`/projects/${project.id}/invoices`)
        .set("Authorization", `Bearer ${approverToken}`)
        .send({ amountIdr: 8_000_000, minDpPercent: 30 })
        .expect(403);

      const list = await request(app.getHttpServer())
        .post(`/projects/${project.id}/invoices`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ amountIdr: 8_000_000, minDpPercent: 30 })
        .expect(201);
      expect(list.body).toHaveLength(1);
      expect(list.body[0]).toMatchObject({ amountIdr: 8_000_000, minDpPercent: 30 });

      const afterInvoice = await request(app.getHttpServer())
        .get(`/projects/${project.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(afterInvoice.body.totalPriceIdr).toBe(8_000_000);
      expect(afterInvoice.body.minDpPercent).toBe(30);

      const invoices = await request(app.getHttpServer())
        .get(`/projects/${project.id}/invoices`)
        .set("Authorization", `Bearer ${approverToken}`)
        .expect(200);
      expect(invoices.body).toHaveLength(1);
    });
  });

  describe("client-submitted payment claims", () => {
    async function pricedProject(adminToken: string, amountIdr = 10_000_000, clientUserId?: string) {
      const project = await createProject(adminToken);
      if (clientUserId) await assignClient(adminToken, project.id, clientUserId);
      await request(app.getHttpServer())
        .patch(`/projects/${project.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ totalPriceIdr: amountIdr })
        .expect(200);
      return project;
    }

    function claimPayment(token: string, projectId: string, body: Record<string, unknown>) {
      return request(app.getHttpServer())
        .post(`/projects/${projectId}/payments/claim`)
        .set("Authorization", `Bearer ${token}`)
        .send(body);
    }

    it("a client's claim is PENDING and does not count toward totalPaidIdr until verified", async () => {
      const { adminToken, token: approverToken, userId } = await signupWithRole(Role.CLIENT_APPROVER);
      const project = await pricedProject(adminToken, 10_000_000, userId);

      const claimRes = await claimPayment(approverToken, project.id, {
        type: "DP",
        amountIdr: 4_000_000,
        method: "Transfer BCA",
        proofImageBase64: "data:image/png;base64,AAAA",
      }).expect(201);
      expect(claimRes.body.totalPaidIdr).toBe(0);
      expect(claimRes.body.paymentStatus).toBe("UNPAID");
      const pending = claimRes.body.payments.find((p: { verificationStatus: string }) => p.verificationStatus === "PENDING");
      expect(pending).toBeDefined();
      expect(pending.proofImageUrl).toBe("data:image/png;base64,AAAA");

      const verified = await request(app.getHttpServer())
        .patch(`/projects/${project.id}/payments/${pending.id}/verify`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ decision: "VERIFIED" })
        .expect(200);
      expect(verified.body.totalPaidIdr).toBe(4_000_000);
      expect(verified.body.paymentStatus).toBe("PARTIAL");
    });

    it("a rejected claim never counts, even after the decision is recorded, and requires a reason", async () => {
      const { adminToken, token: approverToken, userId } = await signupWithRole(Role.CLIENT_APPROVER);
      const project = await pricedProject(adminToken, 10_000_000, userId);

      const claimRes = await claimPayment(approverToken, project.id, {
        type: "DP",
        amountIdr: 4_000_000,
        method: "Transfer BCA",
        proofImageBase64: "data:image/png;base64,AAAA",
      }).expect(201);
      const pendingId = claimRes.body.payments[0].id;

      // No reason given -- rejected outright, the payment stays PENDING.
      await request(app.getHttpServer())
        .patch(`/projects/${project.id}/payments/${pendingId}/verify`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ decision: "REJECTED" })
        .expect(400);

      const rejected = await request(app.getHttpServer())
        .patch(`/projects/${project.id}/payments/${pendingId}/verify`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ decision: "REJECTED", note: "Jumlah di bukti transfer tidak sesuai" })
        .expect(200);
      expect(rejected.body.totalPaidIdr).toBe(0);
      expect(rejected.body.paymentStatus).toBe("UNPAID");
      const pendingAfter = rejected.body.payments.find((p: { id: string }) => p.id === pendingId);
      expect(pendingAfter).toMatchObject({
        verificationStatus: "REJECTED",
        verificationNote: "Jumlah di bukti transfer tidak sesuai",
      });
    });

    it("CLIENT_VIEWER cannot claim a payment", async () => {
      const { adminToken, token: viewerToken } = await signupWithRole(Role.CLIENT_VIEWER);
      const project = await pricedProject(adminToken);
      await claimPayment(viewerToken, project.id, {
        type: "DP",
        amountIdr: 1_000_000,
        method: "Cash",
        proofImageBase64: "data:image/png;base64,AAAA",
      }).expect(403);
    });

    it("rejects a claim before a price is set, same rule as staff-direct recording", async () => {
      const { adminToken, token: approverToken, userId } = await signupWithRole(Role.CLIENT_APPROVER);
      const project = await createProject(adminToken);
      await assignClient(adminToken, project.id, userId);
      await claimPayment(approverToken, project.id, {
        type: "DP",
        amountIdr: 1_000_000,
        method: "Cash",
        proofImageBase64: "data:image/png;base64,AAAA",
      }).expect(400);
    });
  });
});
