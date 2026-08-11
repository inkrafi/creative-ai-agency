-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('DP', 'PELUNASAN', 'OTHER');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "total_price_idr" INTEGER;

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "type" "PaymentType" NOT NULL,
    "amount_idr" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "note" TEXT,
    "recorded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payments_organization_id_idx" ON "payments"("organization_id");

-- CreateIndex
CREATE INDEX "payments_project_id_idx" ON "payments"("project_id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS -- current_tenant_id(), not a raw current_setting(...)::uuid cast.
-- See 20260811000001_fix_rls_regression_deliverables_revisions for why this
-- distinction is load-bearing, and tenant-isolation.e2e-spec.ts's
-- schema-wide invariant tests, which now fail CI if a table skips this.
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_payments ON payments
  USING       (organization_id = current_tenant_id())
  WITH CHECK  (organization_id = current_tenant_id());
