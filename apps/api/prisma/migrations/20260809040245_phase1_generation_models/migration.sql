-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('TEXT');

-- CreateEnum
CREATE TYPE "GenerationJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "LedgerEntryStatus" AS ENUM ('PENDING', 'SETTLED');

-- AlterTable
ALTER TABLE "organizations" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "projects" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "brief_id" UUID,
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "id" DROP DEFAULT;

-- CreateTable
CREATE TABLE "briefs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "briefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "type" "AssetType" NOT NULL DEFAULT 'TEXT',
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_jobs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'anthropic',
    "model" TEXT NOT NULL,
    "status" "GenerationJobStatus" NOT NULL DEFAULT 'PENDING',
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "estimated_cost_micros" INTEGER NOT NULL,
    "actual_cost_micros" INTEGER,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_ledger_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "amount_micros" INTEGER NOT NULL,
    "status" "LedgerEntryStatus" NOT NULL DEFAULT 'SETTLED',
    "generation_job_id" UUID,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "briefs_organization_id_idx" ON "briefs"("organization_id");

-- CreateIndex
CREATE INDEX "briefs_project_id_idx" ON "briefs"("project_id");

-- CreateIndex
CREATE INDEX "assets_organization_id_idx" ON "assets"("organization_id");

-- CreateIndex
CREATE INDEX "assets_task_id_idx" ON "assets"("task_id");

-- CreateIndex
CREATE UNIQUE INDEX "assets_task_id_version_key" ON "assets"("task_id", "version");

-- CreateIndex
CREATE INDEX "generation_jobs_organization_id_idx" ON "generation_jobs"("organization_id");

-- CreateIndex
CREATE INDEX "generation_jobs_task_id_idx" ON "generation_jobs"("task_id");

-- CreateIndex
CREATE INDEX "credit_ledger_entries_organization_id_idx" ON "credit_ledger_entries"("organization_id");

-- CreateIndex
CREATE INDEX "tasks_brief_id_idx" ON "tasks"("brief_id");

-- AddForeignKey
ALTER TABLE "briefs" ADD CONSTRAINT "briefs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_brief_id_fkey" FOREIGN KEY ("brief_id") REFERENCES "briefs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_generation_job_id_fkey" FOREIGN KEY ("generation_job_id") REFERENCES "generation_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS: same pattern as 0002_rls_policies / 0003_fix_rls_null_handling --
-- current_tenant_id() already handles the NULLIF(...,'') fail-closed fix,
-- so these four tables just reuse it.

ALTER TABLE briefs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE briefs                FORCE ROW LEVEL SECURITY;
ALTER TABLE assets                ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets                FORCE ROW LEVEL SECURITY;
ALTER TABLE generation_jobs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_jobs       FORCE ROW LEVEL SECURITY;
ALTER TABLE credit_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_ledger_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_briefs ON briefs
  USING       (organization_id = current_tenant_id())
  WITH CHECK  (organization_id = current_tenant_id());

CREATE POLICY tenant_isolation_assets ON assets
  USING       (organization_id = current_tenant_id())
  WITH CHECK  (organization_id = current_tenant_id());

CREATE POLICY tenant_isolation_generation_jobs ON generation_jobs
  USING       (organization_id = current_tenant_id())
  WITH CHECK  (organization_id = current_tenant_id());

CREATE POLICY tenant_isolation_credit_ledger_entries ON credit_ledger_entries
  USING       (organization_id = current_tenant_id())
  WITH CHECK  (organization_id = current_tenant_id());

-- app_rls / app_auth_bypass already have blanket GRANTs on
-- "ALL TABLES IN SCHEMA public" + default privileges from 0002, so no new
-- GRANT statements are needed for these four tables.
