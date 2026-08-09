/*
  Warnings:

  - Added the required column `context` to the `briefs` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `briefs` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "BriefType" AS ENUM ('WEBSITE', 'DESIGN');

-- Existing rows are all disposable local dev/test data (manual smoke tests
-- + repeated e2e test suite runs) predating the type/context redesign --
-- nothing here is real user data, so clearing rather than backfilling a
-- fake type/context is the honest choice. Tasks.brief_id is ON DELETE SET
-- NULL, so this does not cascade-delete tasks/assets/generation_jobs.
DELETE FROM "briefs";

-- AlterTable
ALTER TABLE "briefs" ADD COLUMN     "context" JSONB NOT NULL,
ADD COLUMN     "type" "BriefType" NOT NULL;
