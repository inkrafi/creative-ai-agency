/**
 * Standalone script (run via `prisma db seed`, i.e. `ts-node prisma/seed.ts`)
 * -- deliberately outside the Nest DI graph, so it re-implements the same
 * "SET LOCAL app.tenant_id, then insert" pattern as
 * PrismaService.runAsTenant() by hand instead of importing it.
 */
import { PrismaClient, Role, TaskStatus } from "@prisma/client";
import { randomUUID } from "crypto";
import * as argon2 from "argon2";

const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL, // app_rls role
});

async function main() {
  const organizationId = randomUUID();
  const email = "admin@demo-agency.test";
  const password = "password123";
  const passwordHash = await argon2.hash(password);

  const { organization, user, project, task } = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${organizationId}, true)`;

    const organization = await tx.organization.create({
      data: { id: organizationId, name: "Demo Agency", slug: `demo-agency-${organizationId.slice(0, 8)}` },
    });

    const user = await tx.user.create({
      data: {
        organizationId,
        email,
        passwordHash,
        name: "Demo Admin",
        role: Role.AGENCY_ADMIN,
      },
    });

    const project = await tx.project.create({
      data: {
        organizationId,
        name: "Sample Campaign",
        description: "Seeded project for local smoke-testing",
      },
    });

    const task = await tx.task.create({
      data: {
        organizationId,
        projectId: project.id,
        title: "Draft first-round copy",
        status: TaskStatus.TODO,
        createdById: user.id,
      },
    });

    // $5.00 of starting credit so the demo org can smoke-test generation
    // (credit_ledger_entries.amount_micros: 1_000_000 micros = $1.00).
    await tx.creditLedgerEntry.create({
      data: {
        organizationId,
        amountMicros: 5_000_000,
        reason: "seed_grant",
      },
    });

    return { organization, user, project, task };
  });

  console.log("Seeded:");
  console.log(`  organization: ${organization.name} (${organization.id})`);
  console.log(`  admin user:   ${user.email} / ${password}`);
  console.log(`  project:      ${project.name} (${project.id})`);
  console.log(`  task:         ${task.title} (${task.id})`);
  console.log("");
  console.log("Smoke test:");
  console.log(`  curl -X POST localhost:3000/auth/login -H "Content-Type: application/json" \\`);
  console.log(`    -d '{"email":"${email}","password":"${password}"}'`);
  console.log(`  # -> { "accessToken": "..." }, then:`);
  console.log(`  curl localhost:3000/projects -H "Authorization: Bearer <accessToken>"`);
  console.log("");
  console.log("Phase 1 (AI generation) smoke test -- create a brief, then stream a draft:");
  console.log(
    `  curl -X POST localhost:3000/briefs -H "Authorization: Bearer <accessToken>" -H "Content-Type: application/json" \\`,
  );
  console.log(
    `    -d '{"projectId":"${project.id}","title":"Ad copy","instructions":"Write a 2-sentence playful ad for a skincare serum."}'`,
  );
  console.log(`  # -> { "id": "<briefId>", ... }, then:`);
  console.log(`  curl -N localhost:3000/briefs/<briefId>/generate -H "Authorization: Bearer <accessToken>"`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
