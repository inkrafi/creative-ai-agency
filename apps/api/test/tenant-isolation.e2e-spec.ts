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

  /**
   * Structural invariants, not behavioural ones -- these assert the shape of
   * every policy in the database rather than exercising one table's
   * behaviour, because the bug they exist to catch is "a new table copied
   * the wrong pattern" and that bug is invisible until someone happens to
   * query that specific table with no tenant context on a reused
   * connection.
   *
   * That is exactly how `deliverables` and `revision_requests` shipped with
   * the pre-20260807000001 raw `current_setting(...)::uuid` pattern while
   * the other eight tables were already fixed: the behavioural fail-closed
   * test above only ever looked at `projects`. These two tests cover every
   * tenant-scoped table that exists now and every one added later, without
   * anyone having to remember to extend them.
   */
  describe("schema-wide RLS invariants", () => {
    /** Every table carrying an organization_id, plus organizations itself (scoped by its own id). */
    async function tenantScopedTables(): Promise<string[]> {
      const rows: Array<{ table_name: string }> = await prisma.rawBase.$queryRawUnsafe(`
        SELECT DISTINCT c.table_name
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE c.table_schema = 'public'
          AND t.table_type = 'BASE TABLE'
          AND (c.column_name = 'organization_id' OR c.table_name = 'organizations')
          AND c.table_name NOT LIKE '\\_prisma%'
      `);
      return rows.map((r) => r.table_name).sort();
    }

    it("every tenant-scoped table has RLS both ENABLED and FORCED", async () => {
      const tables = await tenantScopedTables();
      expect(tables.length).toBeGreaterThan(0);

      const rows: Array<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }> =
        await prisma.rawBase.$queryRawUnsafe(`
          SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind = 'r'
        `);
      const byTable = new Map(rows.map((r) => [r.relname, r]));

      // FORCE matters as much as ENABLE: without it, the table owner (which
      // migrations run as) silently bypasses every policy.
      const unprotected = tables.filter((t) => {
        const row = byTable.get(t);
        return !row?.relrowsecurity || !row?.relforcerowsecurity;
      });
      expect(unprotected).toEqual([]);
    });

    it("every RLS policy uses current_tenant_id(), never a raw current_setting cast", async () => {
      const policies: Array<{ tablename: string; policyname: string; qual: string; with_check: string }> =
        await prisma.rawBase.$queryRawUnsafe(`
          SELECT tablename, policyname, COALESCE(qual, '') AS qual, COALESCE(with_check, '') AS with_check
          FROM pg_policies WHERE schemaname = 'public'
        `);
      expect(policies.length).toBeGreaterThan(0);

      // The raw cast breaks fail-closed on a reused pooled connection: once
      // any transaction on that connection has SET LOCAL the GUC, its reset
      // value is '' rather than NULL, and ''::uuid raises instead of
      // yielding zero rows. current_tenant_id() wraps it in NULLIF -- see
      // the 20260807000001_fix_rls_null_handling migration.
      const offenders = policies
        .filter((p) => /current_setting/.test(p.qual) || /current_setting/.test(p.with_check))
        .map((p) => `${p.tablename}.${p.policyname}`);
      expect(offenders).toEqual([]);

      // And every policy must actually reference the helper -- a policy that
      // referenced neither would be permissive by accident.
      const notUsingHelper = policies
        .filter((p) => !/current_tenant_id\(\)/.test(p.qual + p.with_check))
        .map((p) => `${p.tablename}.${p.policyname}`);
      expect(notUsingHelper).toEqual([]);
    });

    it("fails closed with zero rows -- not an error -- for every tenant-scoped table", async () => {
      const tables = await tenantScopedTables();

      // Reuses prisma.rawBase, the same pool seedOrgWithProject() already
      // ran SET LOCAL on, which is the condition that surfaces the bug.
      for (const table of tables) {
        const rows = await prisma.rawBase.$queryRawUnsafe(`SELECT * FROM "${table}"`);
        expect({ table, count: (rows as unknown[]).length }).toEqual({ table, count: 0 });
      }
    });
  });
});
