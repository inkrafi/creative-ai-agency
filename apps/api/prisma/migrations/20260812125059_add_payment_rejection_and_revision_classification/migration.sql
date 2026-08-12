-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "verification_note" TEXT;

-- AlterTable
ALTER TABLE "revision_requests" ADD COLUMN     "billable" BOOLEAN,
ADD COLUMN     "classification_note" TEXT,
ADD COLUMN     "classified_at" TIMESTAMP(3),
ADD COLUMN     "classified_by_id" UUID;
