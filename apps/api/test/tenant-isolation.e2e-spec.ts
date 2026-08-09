import { Test } from "@nestjs/testing";
import { ClsModule } from "nestjs-cls";
import { randomUUID } from "crypto";
import { PrismaService } from "../src/prisma/prisma.service";

/**
 * These tests bypass HTTP entirely and drive PrismaService.runAsTenant
 * directly with raw SQL, specifically to prove that Postgres itself -- not
 * application code -- is what blocks cross-tenant access. See the risk
 * table in ai-creative-agency-system-design.md ("Cross-tenant data leak" ->
 * "Postgres RLS ... automated isolation tests in CI").
 *
 * Requires a running Postgres with migrations (including
 * 0002_rls_policies) applied: `docker compose up -d && pnpm prisma:deploy`.
 */
describe("Tenant isolation (RLS)", () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ClsModule.forRoot({ global: true })],
      providers: [PrismaService],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  async function seedOrgWithProject() {
    const organizationId = randomUUID();
    return prisma.runAsTenant(organizationId, async (tx) => {
      await tx.organization.create({
        data: { id: organizationId, name: `Org ${organizationId.slice(0, 8)}`, slug: `org-${organizationId}` },
      });
      const project = await tx.project.create({
        data: { organizationId, name: "Test project" },
      });
      return { organizationId, project };
    });
  }

  it("a raw SELECT with no WHERE clause still only returns the caller tenant's rows", async () => {
    const orgA = await seedOrgWithProject();
    const orgB = await seedOrgWithProject();

    const rows: Array<{ id: string }> = await prisma.runAsTenant(orgA.organizationId, (tx) =>
      tx.$queryRawUnsafe("SELECT * FROM projects"),
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(orgA.project.id);
    expect(rows.some((r) => r.id === orgB.project.id)).toBe(false);
  });

  it("a raw UPDATE targeting another tenant's row by id affects zero rows", async () => {
    const orgA = await seedOrgWithProject();
    const orgB = await seedOrgWithProject();

    const affected = await prisma.runAsTenant(orgA.organizationId, (tx) =>
      tx.$executeRawUnsafe(`UPDATE projects SET name = 'hacked' WHERE id = '${orgB.project.id}'`),
    );

    expect(affected).toBe(0);

    const stillIntact = await prisma.runAsTenant(orgB.organizationId, (tx) =>
      tx.project.findUniqueOrThrow({ where: { id: orgB.project.id } }),
    );
    expect(stillIntact.name).toBe("Test project");
  });

  it("fails closed with zero rows when no tenant context is set at all", async () => {
    await seedOrgWithProject();

    const rows = await prisma.rawBase.$queryRawUnsafe("SELECT * FROM projects");

    expect(rows).toHaveLength(0);
  });

  it("cannot create a row under a different tenant_id than the active session context", async () => {
    const orgA = await seedOrgWithProject();
    const otherOrgId = randomUUID();

    await expect(
      prisma.runAsTenant(orgA.organizationId, (tx) =>
        tx.project.create({ data: { organizationId: otherOrgId, name: "Should be rejected" } }),
      ),
    ).rejects.toThrow();
  });
});
