import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { randomUUID } from "crypto";
import { AppModule } from "../src/app.module";

/**
 * Black-box HTTP test covering the full request path (guards + RLS +
 * controllers), complementing the raw-query proof in
 * tenant-isolation.e2e-spec.ts. Requires the same running Postgres.
 */
describe("Auth flow + cross-tenant HTTP access (e2e)", () => {
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

  it("signup issues a token usable to access org-scoped resources", async () => {
    const token = await signup();

    const me = await request(app.getHttpServer())
      .get("/organizations/me")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(me.body.id).toBeDefined();
  });

  it("a project created by tenant A is invisible to tenant B over HTTP", async () => {
    const tokenA = await signup();
    const tokenB = await signup();

    const created = await request(app.getHttpServer())
      .post("/projects")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Tenant A project" })
      .expect(201);

    const listAsB = await request(app.getHttpServer())
      .get("/projects")
      .set("Authorization", `Bearer ${tokenB}`)
      .expect(200);
    expect(listAsB.body.find((p: any) => p.id === created.body.id)).toBeUndefined();

    await request(app.getHttpServer())
      .get(`/projects/${created.body.id}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .expect(404);
  });

  it("rejects requests without a valid token", async () => {
    await request(app.getHttpServer()).get("/projects").expect(401);
  });
});
