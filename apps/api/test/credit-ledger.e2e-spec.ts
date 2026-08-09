import { Test } from "@nestjs/testing";
import { ClsModule } from "nestjs-cls";
import { randomUUID } from "crypto";
import { Role } from "@prisma/client";
import { PrismaService } from "../src/prisma/prisma.service";
import { CreditLedgerService } from "../src/generation/credit-ledger.service";

/**
 * Integration test against a real Postgres -- CreditLedgerService.reserve()
 * relies on Serializable transaction isolation to prevent two concurrent
 * requests from double-spending the same tenant's balance (see the file's
 * own comments). That guarantee can only be proven against a real database;
 * it can't be faked with mocks. Requires the same running Postgres as the
 * other *.e2e-spec.ts files (docker compose up -d && pnpm prisma:deploy).
 */
describe("CreditLedgerService (integration)", () => {
  let prisma: PrismaService;
  let ledger: CreditLedgerService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ClsModule.forRoot({ global: true })],
      providers: [PrismaService, CreditLedgerService],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    ledger = moduleRef.get(CreditLedgerService);
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  /** Seeds an org with a real user/project/task/job to hang ledger entries off, plus a starting balance. */
  async function seedOrgWithJob(startingBalanceMicros: number) {
    const organizationId = randomUUID();
    const jobId = await prisma.runAsTenant(organizationId, async (tx) => {
      await tx.organization.create({
        data: { id: organizationId, name: `Org ${organizationId.slice(0, 8)}`, slug: `org-${organizationId}` },
      });
      const user = await tx.user.create({
        data: {
          organizationId,
          email: `${organizationId}@test.local`,
          passwordHash: "unused-in-this-test",
          name: "Test User",
          role: Role.AGENCY_ADMIN,
        },
      });
      const project = await tx.project.create({ data: { organizationId, name: "Test project" } });
      const task = await tx.task.create({
        data: { organizationId, projectId: project.id, title: "Test task", createdById: user.id },
      });
      const job = await tx.generationJob.create({
        data: { organizationId, taskId: task.id, createdById: user.id, model: "test-model", estimatedCostMicros: 0 },
      });
      if (startingBalanceMicros > 0) {
        await tx.creditLedgerEntry.create({
          data: { organizationId, amountMicros: startingBalanceMicros, reason: "test_seed" },
        });
      }
      return job.id;
    });
    return { organizationId, jobId };
  }

  async function balanceOf(organizationId: string): Promise<number> {
    const agg = await prisma.runAsTenant(organizationId, (tx) =>
      tx.creditLedgerEntry.aggregate({ _sum: { amountMicros: true } }),
    );
    return agg._sum.amountMicros ?? 0;
  }

  it("reserve() places a PENDING hold when balance covers it", async () => {
    const { organizationId, jobId } = await seedOrgWithJob(1_000);

    const result = await ledger.reserve(organizationId, jobId, 500);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    const entry = await prisma.runAsTenant(organizationId, (tx) =>
      tx.creditLedgerEntry.findUniqueOrThrow({ where: { id: result.ledgerEntryId } }),
    );
    expect(entry.amountMicros).toBe(-500);
    expect(entry.status).toBe("PENDING");
    expect(await balanceOf(organizationId)).toBe(500);
  });

  it("reserve() refuses the hold when balance is insufficient, without writing a row", async () => {
    const { organizationId, jobId } = await seedOrgWithJob(100);

    const result = await ledger.reserve(organizationId, jobId, 500);

    expect(result).toEqual({ ok: false, balanceMicros: 100, requestedMicros: 500 });
    // Only the seed entry should exist -- reserve() must not write anything on the rejected path.
    const count = await prisma.runAsTenant(organizationId, (tx) => tx.creditLedgerEntry.count());
    expect(count).toBe(1);
    expect(await balanceOf(organizationId)).toBe(100);
  });

  it("settle() corrects a hold to the real cost", async () => {
    const { organizationId, jobId } = await seedOrgWithJob(1_000);
    const reserved = await ledger.reserve(organizationId, jobId, 500);
    if (!reserved.ok) throw new Error("unreachable");

    await ledger.settle(organizationId, reserved.ledgerEntryId, 320);

    const entry = await prisma.runAsTenant(organizationId, (tx) =>
      tx.creditLedgerEntry.findUniqueOrThrow({ where: { id: reserved.ledgerEntryId } }),
    );
    expect(entry.amountMicros).toBe(-320);
    expect(entry.status).toBe("SETTLED");
    expect(await balanceOf(organizationId)).toBe(1_000 - 320);
  });

  it("release() zeroes out a hold so a failed generation isn't charged", async () => {
    const { organizationId, jobId } = await seedOrgWithJob(1_000);
    const reserved = await ledger.reserve(organizationId, jobId, 500);
    if (!reserved.ok) throw new Error("unreachable");

    await ledger.release(organizationId, reserved.ledgerEntryId);

    const entry = await prisma.runAsTenant(organizationId, (tx) =>
      tx.creditLedgerEntry.findUniqueOrThrow({ where: { id: reserved.ledgerEntryId } }),
    );
    expect(entry.amountMicros).toBe(0);
    expect(entry.status).toBe("SETTLED");
    expect(await balanceOf(organizationId)).toBe(1_000);
  });

  it("two concurrent reserve() calls cannot both succeed past the balance (no double-spend)", async () => {
    const { organizationId, jobId } = await seedOrgWithJob(1_000);

    // Neither request alone exceeds the balance, but both together (1_400) do --
    // a plain READ COMMITTED check-then-insert would let both through.
    const [first, second] = await Promise.all([
      ledger.reserve(organizationId, jobId, 700),
      ledger.reserve(organizationId, jobId, 700),
    ]);

    const outcomes = [first, second];
    const succeeded = outcomes.filter((r) => r.ok);
    const rejected = outcomes.filter((r) => !r.ok);

    expect(succeeded).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(await balanceOf(organizationId)).toBe(1_000 - 700);
  });
});
