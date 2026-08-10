-- CreateTable
CREATE TABLE "revision_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "note" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revision_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "revision_requests_organization_id_idx" ON "revision_requests"("organization_id");

-- CreateIndex
CREATE INDEX "revision_requests_task_id_idx" ON "revision_requests"("task_id");

-- CreateIndex
CREATE UNIQUE INDEX "revision_requests_task_id_round_key" ON "revision_requests"("task_id", "round");

-- AddForeignKey
ALTER TABLE "revision_requests" ADD CONSTRAINT "revision_requests_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS -- every tenant-scoped table needs this (see 0002_rls_policies and
-- phase1_generation_models migrations for the same pattern).
ALTER TABLE revision_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE revision_requests FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_revision_requests ON revision_requests
  USING       (organization_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK  (organization_id = current_setting('app.tenant_id', true)::uuid);
