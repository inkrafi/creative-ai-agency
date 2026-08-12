-- CreateEnum
CREATE TYPE "PaymentVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- AlterTable
ALTER TABLE "briefs" ADD COLUMN     "ai_price_reasoning" TEXT,
ADD COLUMN     "ai_suggested_price_idr" INTEGER;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "proof_image_url" TEXT,
ADD COLUMN     "verification_status" "PaymentVerificationStatus" NOT NULL DEFAULT 'VERIFIED',
ADD COLUMN     "verified_at" TIMESTAMP(3),
ADD COLUMN     "verified_by_id" UUID;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "min_dp_percent" INTEGER;

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "brief_id" UUID,
    "amount_idr" INTEGER NOT NULL,
    "min_dp_percent" INTEGER,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email_sent_at" TIMESTAMP(3),

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoices_organization_id_idx" ON "invoices"("organization_id");

-- CreateIndex
CREATE INDEX "invoices_project_id_idx" ON "invoices"("project_id");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_brief_id_fkey" FOREIGN KEY ("brief_id") REFERENCES "briefs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS -- current_tenant_id(), not a raw current_setting(...)::uuid cast.
-- See 20260811000001_fix_rls_regression_deliverables_revisions for why this
-- distinction is load-bearing, and tenant-isolation.e2e-spec.ts's
-- schema-wide invariant tests, which now fail CI if a table skips this.
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_invoices ON invoices
  USING       (organization_id = current_tenant_id())
  WITH CHECK  (organization_id = current_tenant_id());
