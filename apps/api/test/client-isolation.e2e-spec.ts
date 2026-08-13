import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { randomUUID } from "crypto";
import * as argon2 from "argon2";
import { Role } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * Isolation *between different clients of the same Kravio org* -- a layer
 * on top of (not instead of) RLS's tenant isolation, added because
 * self-service registration + client-created projects made the old "every
 * client shares one org, so every client sees every project" behavior a
 * real privacy problem. See client-project-access.ts.
 */
describe("Client isolation + self-signup (e2e)", () => {
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

  async function signupStaff() {
    const email = `${randomUUID()}@test.local`;
    const res = await request(app.getHttpServer())
      .post("/auth/signup")
      .send({ orgName: `Org ${email}`, adminName: "Admin", email, password: "password123" })
      .expect(201);
    return res.body.accessToken as string;
  }

  /**
   * signupStaff() always spins up a brand-new org (see AuthService.signup),
   * which is never the fixed KRAVIO_ORGANIZATION_ID clientSignup() joins --
   * so a staff account *in that same org* needs seeding directly, the same
   * way other specs seed a non-admin role (no invite endpoint exists for
   * agency staff, only for clients -- see users.service.ts).
   */
  async function signupStaffInKravioOrg() {
    const organizationId = process.env.KRAVIO_ORGANIZATION_ID!;
    const email = `${randomUUID()}@test.local`;
    const passwordHash = await argon2.hash("password123");
    await prisma.runAsTenant(organizationId, (tx) =>
      tx.user.create({
        data: { organizationId, email, passwordHash, name: "Staff in Kravio org", role: Role.AGENCY_ADMIN },
      }),
    );
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email, password: "password123" })
      .expect(201);
    return login.body.accessToken as string;
  }

  async function signupClient() {
    const email = `${randomUUID()}@test.local`;
    const res = await request(app.getHttpServer())
      .post("/auth/client-signup")
      .send({ name: "Klien", email, password: "password123" })
      .expect(201);
    return { token: res.body.accessToken as string, email };
  }

  async function createProjectAsClient(clientToken: string) {
    const res = await request(app.getHttpServer())
      .post("/projects")
      .set("Authorization", `Bearer ${clientToken}`)
      .send({ name: `Client project ${randomUUID()}` })
      .expect(201);
    return res.body as { id: string; clientOwnerId: string | null };
  }

  async function createBrief(token: string, projectId: string) {
    const res = await request(app.getHttpServer())
      .post("/briefs")
      .set("Authorization", `Bearer ${token}`)
      .send({
        projectId,
        title: "Test brief",
        type: "LANDING_PAGE",
        context: {
          businessType: "A",
          targetAudience: "B",
          painPoints: "C",
          goals: "D",
        },
      })
      .expect(201);
    return res.body as { id: string; taskId: string };
  }

  describe("POST /auth/client-signup", () => {
    it("creates a working CLIENT_APPROVER login in the configured org", async () => {
      const { token } = await signupClient();

      const me = await request(app.getHttpServer())
        .get("/organizations/me")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(me.body.id).toBe(process.env.KRAVIO_ORGANIZATION_ID);
    });

    it("rejects a duplicate email with 409", async () => {
      const email = `${randomUUID()}@test.local`;
      await request(app.getHttpServer())
        .post("/auth/client-signup")
        .send({ name: "Klien", email, password: "password123" })
        .expect(201);
      await request(app.getHttpServer())
        .post("/auth/client-signup")
        .send({ name: "Klien Lagi", email, password: "password123" })
        .expect(409);
    });
  });

  describe("a self-registered client can create their own project + brief", () => {
    it("POST /projects sets clientOwnerId automatically; POST /briefs succeeds on it", async () => {
      const { token } = await signupClient();
      const project = await createProjectAsClient(token);
      expect(project.clientOwnerId).toBeTruthy();

      const brief = await createBrief(token, project.id);
      expect(brief.id).toBeTruthy();
    });
  });

  describe("client A cannot see or act on client B's project", () => {
    it("GET /projects/:id is 404, not 403 -- fails closed like RLS", async () => {
      const clientA = await signupClient();
      const clientB = await signupClient();
      const projectA = await createProjectAsClient(clientA.token);

      await request(app.getHttpServer())
        .get(`/projects/${projectA.id}`)
        .set("Authorization", `Bearer ${clientB.token}`)
        .expect(404);
    });

    it("GET /projects (list) never includes another client's project", async () => {
      const clientA = await signupClient();
      const clientB = await signupClient();
      const projectA = await createProjectAsClient(clientA.token);

      const listAsB = await request(app.getHttpServer())
        .get("/projects")
        .set("Authorization", `Bearer ${clientB.token}`)
        .expect(200);
      expect(listAsB.body.find((p: { id: string }) => p.id === projectA.id)).toBeUndefined();
    });

    it("cannot submit a brief onto another client's project", async () => {
      const clientA = await signupClient();
      const clientB = await signupClient();
      const projectA = await createProjectAsClient(clientA.token);

      await request(app.getHttpServer())
        .post("/briefs")
        .set("Authorization", `Bearer ${clientB.token}`)
        .send({
          projectId: projectA.id,
          title: "Sneaky brief",
          type: "LANDING_PAGE",
          context: { businessType: "A", targetAudience: "B", painPoints: "C", goals: "D" },
        })
        .expect(404);
    });

    it("cannot read another client's brief or task, cannot claim a payment on it", async () => {
      const clientA = await signupClient();
      const clientB = await signupClient();
      const projectA = await createProjectAsClient(clientA.token);
      const briefA = await createBrief(clientA.token, projectA.id);

      await request(app.getHttpServer())
        .get(`/briefs/${briefA.id}`)
        .set("Authorization", `Bearer ${clientB.token}`)
        .expect(404);

      await request(app.getHttpServer())
        .get(`/tasks/${briefA.taskId}`)
        .set("Authorization", `Bearer ${clientB.token}`)
        .expect(404);

      await request(app.getHttpServer())
        .get(`/tasks?projectId=${projectA.id}`)
        .set("Authorization", `Bearer ${clientB.token}`)
        .expect(404);

      await request(app.getHttpServer())
        .post(`/projects/${projectA.id}/payments/claim`)
        .set("Authorization", `Bearer ${clientB.token}`)
        .send({ type: "DP", amountIdr: 1000, method: "Cash", proofImageBase64: "data:image/png;base64,AAAA" })
        .expect(404);
    });

    it("cannot approve or request revision on another client's task", async () => {
      const clientA = await signupClient();
      const clientB = await signupClient();
      const projectA = await createProjectAsClient(clientA.token);
      const briefA = await createBrief(clientA.token, projectA.id);

      await request(app.getHttpServer())
        .post(`/tasks/${briefA.taskId}/approve`)
        .set("Authorization", `Bearer ${clientB.token}`)
        .expect(404);

      await request(app.getHttpServer())
        .post(`/tasks/${briefA.taskId}/request-revision`)
        .set("Authorization", `Bearer ${clientB.token}`)
        .send({ note: "please fix" })
        .expect(404);
    });
  });

  describe("staff are unaffected by client-ownership scoping", () => {
    it("staff still see every project in their org regardless of clientOwnerId", async () => {
      const staffToken = await signupStaff();
      const staffProject = await request(app.getHttpServer())
        .post("/projects")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ name: "Staff-created project" })
        .expect(201);
      expect(staffProject.body.clientOwnerId).toBeNull();

      const list = await request(app.getHttpServer())
        .get("/projects")
        .set("Authorization", `Bearer ${staffToken}`)
        .expect(200);
      expect(list.body.find((p: { id: string }) => p.id === staffProject.body.id)).toBeDefined();
    });
  });

  describe("GET /projects/summary is staff-only", () => {
    it("403s for a client", async () => {
      const { token } = await signupClient();
      await request(app.getHttpServer())
        .get("/projects/summary")
        .set("Authorization", `Bearer ${token}`)
        .expect(403);
    });
  });

  describe("staff can assign a legacy project to a client", () => {
    it("PATCH /projects/:id with clientOwnerId makes it visible to that client", async () => {
      const staffToken = await signupStaffInKravioOrg();

      const project = await request(app.getHttpServer())
        .post("/projects")
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ name: "Legacy project" })
        .expect(201);
      expect(project.body.clientOwnerId).toBeNull();

      const client = await signupClient();
      await request(app.getHttpServer())
        .get(`/projects/${project.body.id}`)
        .set("Authorization", `Bearer ${client.token}`)
        .expect(404);

      const organizationId = process.env.KRAVIO_ORGANIZATION_ID!;
      const clientUser = await prisma.runAsTenant(organizationId, (tx) =>
        tx.user.findFirstOrThrow({ where: { email: client.email } }),
      );

      await request(app.getHttpServer())
        .patch(`/projects/${project.body.id}`)
        .set("Authorization", `Bearer ${staffToken}`)
        .send({ clientOwnerId: clientUser.id })
        .expect(200);

      const afterAssignment = await request(app.getHttpServer())
        .get(`/projects/${project.body.id}`)
        .set("Authorization", `Bearer ${client.token}`)
        .expect(200);
      expect(afterAssignment.body.id).toBe(project.body.id);
    });
  });
});
