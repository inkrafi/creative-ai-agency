-- AlterTable
ALTER TABLE "briefs" ADD COLUMN     "clarification_note" TEXT,
ADD COLUMN     "clarification_responded_at" TIMESTAMP(3),
ADD COLUMN     "needs_clarification" BOOLEAN NOT NULL DEFAULT false;
