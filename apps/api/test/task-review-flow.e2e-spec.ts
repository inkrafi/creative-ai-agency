import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { randomUUID } from "crypto";
import * as argon2 from "argon2";
import { Role } from "@prisma/client";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * The client review cycle: a human (designer/developer) submits their
 * finished work for review, the client either approves or asks for
 * changes -- up to `maxRevisions` times (default 2) before it needs a new
 * arrangement. See TasksService's submitForReview/requestRevision/approve
 * and their comments for why this exists (an AI draft alone was never the
 * deliverable -- see briefs.e2e-spec.ts's IN_PROGRESS assertion).
 */
describe("Task review flow (e2e)", () => {
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

  async function createTask(token: string) {
    const project = await request(app.getHttpServer())
      .post("/projects")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Test project" })
      .expect(201);

    const task = await request(app.getHttpServer())
      .post("/tasks")
      .set("Authorization", `Bearer ${token}`)
      .send({ projectId: project.body.id, title: "Landing page copy" })
      .expect(201);

    return task.body as { id: string; status: string; maxRevisions: number; revisionsUsed: number };
  }

  function submitForReview(token: string, taskId: string, url = "https://staging.example.test/preview") {
    return request(app.getHttpServer())
      .post(`/tasks/${taskId}/submit-for-review`)
      .set("Authorization", `Bearer ${token}`)
      .send({ deliverableUrl: url, deliverableNote: "First pass, footer still pending" });
  }

  function requestRevision(token: string, taskId: string, note = "Colors are too bright, please tone down") {
    return request(app.getHttpServer())
      .post(`/tasks/${taskId}/request-revision`)
      .set("Authorization", `Bearer ${token}`)
      .send({ note });
  }

  it("starts TODO with the default revision allowance", async () => {
    const token = await signup();
    const task = await createTask(token);
    expect(task.status).toBe("TODO");
    expect(task.maxRevisions).toBe(2);
    expect(task.revisionsUsed).toBe(0);
  });

  it("rejects submit-for-review without a deliverable URL", async () => {
    const token = await signup();
    const task = await createTask(token);

    await request(app.getHttpServer())
      .post(`/tasks/${task.id}/submit-for-review`)
      .set("Authorization", `Bearer ${token}`)
      .send({})
      .expect(400);
  });

  it("goes through submit-for-review -> approve, recording the deliverable", async () => {
    const token = await signup();
    const task = await createTask(token);

    const submitted = await submitForReview(token, task.id, "https://staging.example.test/v1").expect(201);
    expect(submitted.body.status).toBe("IN_REVIEW");
    expect(submitted.body.deliverables).toHaveLength(1);
    expect(submitted.body.deliverables[0]).toMatchObject({
      url: "https://staging.example.test/v1",
      version: 1,
    });

    const approved = await request(app.getHttpServer())
      .post(`/tasks/${task.id}/approve`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    expect(approved.body.status).toBe("DONE");
  });

  it("a revision request sends the task back to IN_PROGRESS, counts against the limit, and logs the note", async () => {
    const token = await signup();
    const task = await createTask(token);

    await submitForReview(token, task.id).expect(201);

    const revised = await requestRevision(token, task.id, "Colors are too bright, please tone down").expect(201);
    expect(revised.body.status).toBe("IN_PROGRESS");
    expect(revised.body.revisionsUsed).toBe(1);
    expect(revised.body.revisionRequests).toHaveLength(1);
    expect(revised.body.revisionRequests[0]).toMatchObject({
      round: 1,
      note: "Colors are too bright, please tone down",
    });
  });

  it("rejects request-revision without a note", async () => {
    const token = await signup();
    const task = await createTask(token);
    await submitForReview(token, task.id).expect(201);

    await request(app.getHttpServer())
      .post(`/tasks/${task.id}/request-revision`)
      .set("Authorization", `Bearer ${token}`)
      .send({})
      .expect(400);
  });

  it("re-submitting after a revision adds a new deliverable version instead of overwriting it", async () => {
    const token = await signup();
    const task = await createTask(token);

    await submitForReview(token, task.id, "https://staging.example.test/v1").expect(201);
    await requestRevision(token, task.id).expect(201);
    const resubmitted = await submitForReview(token, task.id, "https://staging.example.test/v2").expect(201);

    expect(resubmitted.body.deliverables).toHaveLength(2);
    // Newest first (findOne orders by version desc).
    expect(resubmitted.body.deliverables[0]).toMatchObject({ url: "https://staging.example.test/v2", version: 2 });
    expect(resubmitted.body.deliverables[1]).toMatchObject({ url: "https://staging.example.test/v1", version: 1 });
  });

  it("blocks a revision request once the limit is reached (402) and never touches status", async () => {
    const token = await signup();
    const task = await createTask(token);

    // Use up both included revisions (default maxRevisions: 2).
    for (let i = 0; i < 2; i++) {
      await submitForReview(token, task.id).expect(201);
      await requestRevision(token, task.id).expect(201);
    }

    await submitForReview(token, task.id).expect(201);

    const res = await requestRevision(token, task.id).expect(402);
    expect(res.body.message).toMatch(/revision limit reached/i);

    const stillInReview = await request(app.getHttpServer())
      .get(`/tasks/${task.id}`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(stillInReview.body.status).toBe("IN_REVIEW");
    expect(stillInReview.body.revisionsUsed).toBe(2);
  });

  it("rejects request-revision and approve on a task that isn't in review", async () => {
    const token = await signup();
    const task = await createTask(token); // status: TODO

    // A valid note is included so the 400 is genuinely from the status
    // check, not incidentally from DTO validation rejecting a missing note.
    await requestRevision(token, task.id, "Some feedback").expect(400);

    await request(app.getHttpServer())
      .post(`/tasks/${task.id}/approve`)
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
  });

  it("rejects submit-for-review on an already-DONE task", async () => {
    const token = await signup();
    const task = await createTask(token);

    await submitForReview(token, task.id).expect(201);
    await request(app.getHttpServer())
      .post(`/tasks/${task.id}/approve`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    await submitForReview(token, task.id).expect(400);
  });

  /**
   * The state machine above is only worth anything if it can't be walked
   * around. Both of these are regression tests for holes found by actually
   * attacking a running server, not hypotheticals:
   *
   *  - `PATCH /tasks/:id {"status":"DONE"}` used to take a task from TODO
   *    straight to DONE, skipping the deliverable requirement, the client's
   *    approval, and the revision limit in one request.
   *  - TasksController had no @Roles() at all, so CLIENT_VIEWER -- the
   *    view-only role -- could create, delete and approve work.
   */
  describe("the review state machine can't be bypassed", () => {
    /** Signs up an org (admin), then adds a second user in `role` and logs in as them. */
    async function signupWithRole(role: Role) {
      const adminEmail = `${randomUUID()}@test.local`;
      const signupRes = await request(app.getHttpServer())
        .post("/auth/signup")
        .send({ orgName: `Org ${adminEmail}`, adminName: "Admin", email: adminEmail, password: "password123" })
        .expect(201);
      const adminToken = signupRes.body.accessToken as string;

      const me = await request(app.getHttpServer())
        .get("/organizations/me")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      const organizationId = me.body.id as string;

      // No user-creation endpoint exists yet, so the non-admin member is
      // seeded directly -- the point here is the guard, not user CRUD.
      const email = `${randomUUID()}@test.local`;
      const passwordHash = await argon2.hash("password123");
      await prisma.runAsTenant(organizationId, (tx) =>
        tx.user.create({ data: { organizationId, email, passwordHash, name: `A ${role}`, role } }),
      );

      const login = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email, password: "password123" })
        .expect(201);

      return { adminToken, token: login.body.accessToken as string };
    }

    it("PATCH cannot set status -- the field is rejected outright", async () => {
      const token = await signup();
      const task = await createTask(token);

      await request(app.getHttpServer())
        .patch(`/tasks/${task.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ status: "DONE" })
        .expect(400);

      const after = await request(app.getHttpServer())
        .get(`/tasks/${task.id}`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(after.body.status).toBe("TODO");
    });

    it("PATCH still updates the fields it legitimately owns", async () => {
      const token = await signup();
      const task = await createTask(token);

      const res = await request(app.getHttpServer())
        .patch(`/tasks/${task.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "Renamed", description: "Still editable" })
        .expect(200);
      expect(res.body).toMatchObject({ title: "Renamed", description: "Still editable", status: "TODO" });
    });

    it("PATCH cannot inflate the revision allowance", async () => {
      const token = await signup();
      const task = await createTask(token);

      await request(app.getHttpServer())
        .patch(`/tasks/${task.id}`)
        .set("Authorization", `Bearer ${token}`)
        .send({ maxRevisions: 999 })
        .expect(400);
    });

    it("CLIENT_VIEWER can read tasks but cannot create, delete, approve or request revisions", async () => {
      const { adminToken, token: viewerToken } = await signupWithRole(Role.CLIENT_VIEWER);
      const task = await createTask(adminToken);
      await submitForReview(adminToken, task.id).expect(201);

      // Reading is the whole point of the viewer role -- that must still work.
      await request(app.getHttpServer())
        .get(`/tasks/${task.id}`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .post(`/tasks/${task.id}/approve`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .post(`/tasks/${task.id}/request-revision`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .send({ note: "change it" })
        .expect(403);
      await request(app.getHttpServer())
        .delete(`/tasks/${task.id}`)
        .set("Authorization", `Bearer ${viewerToken}`)
        .expect(403);
    });

    it("CLIENT_APPROVER can approve, but cannot create or delete work", async () => {
      const { adminToken, token: approverToken } = await signupWithRole(Role.CLIENT_APPROVER);
      const task = await createTask(adminToken);
      await submitForReview(adminToken, task.id).expect(201);

      await request(app.getHttpServer())
        .delete(`/tasks/${task.id}`)
        .set("Authorization", `Bearer ${approverToken}`)
        .expect(403);

      const approved = await request(app.getHttpServer())
        .post(`/tasks/${task.id}/approve`)
        .set("Authorization", `Bearer ${approverToken}`)
        .expect(201);
      expect(approved.body.status).toBe("DONE");
    });

    it("AGENCY_EDITOR can run the work but cannot delete a task", async () => {
      const { token: editorToken } = await signupWithRole(Role.AGENCY_EDITOR);
      const task = await createTask(editorToken);
      await submitForReview(editorToken, task.id).expect(201);

      await request(app.getHttpServer())
        .delete(`/tasks/${task.id}`)
        .set("Authorization", `Bearer ${editorToken}`)
        .expect(403);
    });
  });
});
