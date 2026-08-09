import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { randomUUID } from "crypto";
import { AppModule } from "../src/app.module";

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

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
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

  it("starts TODO with the default revision allowance", async () => {
    const token = await signup();
    const task = await createTask(token);
    expect(task.status).toBe("TODO");
    expect(task.maxRevisions).toBe(2);
    expect(task.revisionsUsed).toBe(0);
  });

  it("goes through submit-for-review -> approve", async () => {
    const token = await signup();
    const task = await createTask(token);

    const submitted = await request(app.getHttpServer())
      .post(`/tasks/${task.id}/submit-for-review`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    expect(submitted.body.status).toBe("IN_REVIEW");

    const approved = await request(app.getHttpServer())
      .post(`/tasks/${task.id}/approve`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    expect(approved.body.status).toBe("DONE");
  });

  it("a revision request sends the task back to IN_PROGRESS and counts against the limit", async () => {
    const token = await signup();
    const task = await createTask(token);

    await request(app.getHttpServer())
      .post(`/tasks/${task.id}/submit-for-review`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    const revised = await request(app.getHttpServer())
      .post(`/tasks/${task.id}/request-revision`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    expect(revised.body.status).toBe("IN_PROGRESS");
    expect(revised.body.revisionsUsed).toBe(1);
  });

  it("blocks a revision request once the limit is reached (402) and never touches status", async () => {
    const token = await signup();
    const task = await createTask(token);

    // Use up both included revisions (default maxRevisions: 2).
    for (let i = 0; i < 2; i++) {
      await request(app.getHttpServer())
        .post(`/tasks/${task.id}/submit-for-review`)
        .set("Authorization", `Bearer ${token}`)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/tasks/${task.id}/request-revision`)
        .set("Authorization", `Bearer ${token}`)
        .expect(201);
    }

    await request(app.getHttpServer())
      .post(`/tasks/${task.id}/submit-for-review`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/tasks/${task.id}/request-revision`)
      .set("Authorization", `Bearer ${token}`)
      .expect(402);
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

    await request(app.getHttpServer())
      .post(`/tasks/${task.id}/request-revision`)
      .set("Authorization", `Bearer ${token}`)
      .expect(400);

    await request(app.getHttpServer())
      .post(`/tasks/${task.id}/approve`)
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
  });

  it("rejects submit-for-review on an already-DONE task", async () => {
    const token = await signup();
    const task = await createTask(token);

    await request(app.getHttpServer())
      .post(`/tasks/${task.id}/submit-for-review`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
    await request(app.getHttpServer())
      .post(`/tasks/${task.id}/approve`)
      .set("Authorization", `Bearer ${token}`)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/tasks/${task.id}/submit-for-review`)
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
  });
});
