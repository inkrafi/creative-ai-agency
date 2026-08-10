-- CreateTable
CREATE TABLE "deliverables" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "note" TEXT,
    "version" INTEGER NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deliverables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deliverables_organization_id_idx" ON "deliverables"("organization_id");

-- CreateIndex
CREATE INDEX "deliverables_task_id_idx" ON "deliverables"("task_id");

-- CreateIndex
CREATE UNIQUE INDEX "deliverables_task_id_version_key" ON "deliverables"("task_id", "version");

-- AddForeignKey
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS -- every tenant-scoped table needs this (see 0002_rls_policies and
-- phase1_generation_models migrations for the same pattern).
ALTER TABLE deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliverables FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_deliverables ON deliverables
  USING       (organization_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK  (organization_id = current_setting('app.tenant_id', true)::uuid);
