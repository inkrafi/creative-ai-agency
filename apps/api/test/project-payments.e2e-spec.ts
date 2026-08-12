import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { randomUUID } from "crypto";
import * as argon2 from "argon2";
import { Role } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * Manual DP/pelunasan bookkeeping: Project.totalPriceIdr is the agreed
 * total, Payment rows are append-only records of what staff say came in
 * (see Payment's schema comment for why there's no stored balance column),
 * and paymentStatus (NO_PRICE/UNPAID/PARTIAL/PAID) is derived from
 * SUM(payments) vs totalPriceIdr on every read -- never itself stored.
 */
describe("Project payments (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
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

    return { adminToken, token: login.body.accessToken as string, userId: user.id };
  }

  async function createProject(token: string) {
    const res = await request(app.getHttpServer())
      .post("/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Test project" })
      .expect(201);
    return res.body as { id: string };
  }

  function recordPayment(token: string, projectId: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post(`/projects/${projectId}/payments`)
      .set("Authorization", `Bearer ${token}`)
      .send(body);
  }

  it("a fresh project has no price and status NO_PRICE", async () => {
    const token = await signup();
    const project = await createProject(token);

    const res = await request(app.getHttpServer())
      .get(`/projects/${project.id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(res.body.totalPriceIdr).toBeNull();
    expect(res.body.totalPaidIdr).toBe(0);
    expect(res.body.paymentStatus).toBe("NO_PRICE");
  });

  it("rejects recording a payment before a price is set", async () => {
    const token = await signup();
    const project = await createProject(token);

    await recordPayment(token, project.id, { type: "DP", amountIdr: 1_000_000, method: "Transfer BCA" }).expect(400);
  });

  it("goes UNPAID -> PARTIAL (after DP) -> PAID (after pelunasan)", async () => {
    const token = await signup();
    const project = await createProject(token);

    await request(app.getHttpServer())
      .patch(`/projects/${project.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ totalPriceIdr: 10_000_000 })
      .expect(200);

    const afterPrice = await request(app.getHttpServer())
      .get(`/projects/${project.id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(afterPrice.body.paymentStatus).toBe("UNPAID");

    const afterDp = await recordPayment(token, project.id, {
      type: "DP",
      amountIdr: 4_000_000,
      method: "Transfer BCA",
      note: "50% muka",
    }).expect(201);
    expect(afterDp.body.totalPaidIdr).toBe(4_000_000);
    expect(afterDp.body.paymentStatus).toBe("PARTIAL");
    expect(afterDp.body.payments).toHaveLength(1);
    expect(afterDp.body.payments[0]).toMatchObject({ type: "DP", amountIdr: 4_000_000 });

    const afterPelunasan = await recordPayment(token, project.id, {
      type: "PELUNASAN",
      amountIdr: 6_000_000,
      method: "Cash",
    }).expect(201);
    expect(afterPelunasan.body.totalPaidIdr).toBe(10_000_000);
    expect(afterPelunasan.body.paymentStatus).toBe("PAID");
    expect(afterPelunasan.body.payments).toHaveLength(2);
  });

  it("rejects a non-positive amount", async () => {
    const token = await signup();
    const project = await createProject(token);
    await request(app.getHttpServer())
      .patch(`/projects/${project.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ totalPriceIdr: 1_000_000 })
      .expect(200);

    await recordPayment(token, project.id, { type: "DP", amountIdr: 0, method: "Cash" }).expect(400);
    await recordPayment(token, project.id, { type: "DP", amountIdr: -500, method: "Cash" }).expect(400);
  });

  it("CLIENT_VIEWER can read payment status but cannot record a payment", async () => {
    const { adminToken, token: viewerToken, userId: viewerId } = await signupWithRole(Role.CLIENT_VIEWER);
    const project = await createProject(adminToken);
    await request(app.getHttpServer())
      .patch(`/projects/${project.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ totalPriceIdr: 1_000_000, clientOwnerId: viewerId })
      .expect(200);

    await request(app.getHttpServer())
      .get(`/projects/${project.id}`)
      .set("Authorization", `Bearer ${viewerToken}`)
      .expect(200);

    await recordPayment(viewerToken, project.id, { type: "DP", amountIdr: 500_000, method: "Cash" }).expect(403);
  });

  it("CLIENT_APPROVER cannot record a payment either -- it's a staff bookkeeping action", async () => {
    const { adminToken, token: approverToken } = await signupWithRole(Role.CLIENT_APPROVER);
    const project = await createProject(adminToken);
    await request(app.getHttpServer())
      .patch(`/projects/${project.id}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ totalPriceIdr: 1_000_000 })
      .expect(200);

    await recordPayment(approverToken, project.id, { type: "DP", amountIdr: 500_000, method: "Cash" }).expect(403);
  });

  it("findAll() carries the same totalPaidIdr/paymentStatus fields as findOne() -- no N+1 needed for list views", async () => {
    const token = await signup();
    const project = await createProject(token);
    await request(app.getHttpServer())
      .patch(`/projects/${project.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ totalPriceIdr: 2_000_000 })
      .expect(200);
    await recordPayment(token, project.id, { type: "DP", amountIdr: 500_000, method: "Cash" }).expect(201);

    const list = await request(app.getHttpServer())
      .get("/projects")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const row = list.body.find((p: { id: string }) => p.id === project.id);
    expect(row).toMatchObject({ totalPriceIdr: 2_000_000, totalPaidIdr: 500_000, paymentStatus: "PARTIAL" });
    // Regression check: findAll() must carry `payments` itself, not just the
    // fields derived from it -- callers (the finance dashboard) flatten
    // payments across projects for a combined recent-activity view.
    expect(row.payments).toHaveLength(1);
    expect(row.payments[0]).toMatchObject({ type: "DP", amountIdr: 500_000, method: "Cash" });
  });

  describe("GET /projects/summary", () => {
    it("is reachable and isn't shadowed by the :id route", async () => {
      const token = await signup();
      const res = await request(app.getHttpServer())
        .get("/projects/summary")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(res.body).toMatchObject({ activeProjects: 0, tasksInReview: 0, totalRevenueIdr: 0, outstandingIdr: 0 });
    });

    it("aggregates active projects, revenue, and outstanding balance across the tenant", async () => {
      const token = await signup();

      const paidOff = await createProject(token);
      await request(app.getHttpServer())
        .patch(`/projects/${paidOff.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ totalPriceIdr: 1_000_000 })
        .expect(200);
      await recordPayment(token, paidOff.id, { type: "PELUNASAN", amountIdr: 1_000_000, method: "Cash" }).expect(
        201,
      );

      const partial = await createProject(token);
      await request(app.getHttpServer())
        .patch(`/projects/${partial.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ totalPriceIdr: 5_000_000 })
        .expect(200);
      await recordPayment(token, partial.id, { type: "DP", amountIdr: 2_000_000, method: "Transfer" }).expect(201);

      await createProject(token); // no price at all -- contributes 0 to both totals

      const res = await request(app.getHttpServer())
        .get("/projects/summary")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(res.body).toMatchObject({
        activeProjects: 3,
        totalRevenueIdr: 3_000_000, // 1,000,000 + 2,000,000
        outstandingIdr: 3_000_000, // (5,000,000 - 2,000,000) from the partial one only
      });
    });
  });
});
