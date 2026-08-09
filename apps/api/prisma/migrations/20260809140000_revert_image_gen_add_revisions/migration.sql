-- Reverts the Phase 2 image-generation schema addition (built, then found
-- not to match the real workflow: AI drafts are always a starting point for
-- a human designer/developer, never a generated final asset -- see
-- brief-context.ts's BRIEF_SYSTEM_PROMPTS comment) and adds revision
-- tracking for the client review cycle.
--
-- Hand-written, not `prisma migrate dev` output: the auto-generated version
-- requires interactive confirmation (dropping non-null columns / enum
-- values) which this non-interactive shell can't provide. The 3 disposable
-- test rows that had NULL `content` (from this session's own image-gen e2e
-- test runs, not real user data) were deleted directly before this ran.

-- AlterTable: drop the image-generation-only column, restore content NOT NULL
ALTER TABLE "assets" DROP COLUMN "storage_path";
ALTER TABLE "assets" ALTER COLUMN "content" SET NOT NULL;

-- AlterEnum: remove 'IMAGE' from AssetType (Postgres requires recreating
-- the type -- there's no direct "DROP VALUE").
CREATE TYPE "AssetType_new" AS ENUM ('TEXT');
ALTER TABLE "assets" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "assets" ALTER COLUMN "type" TYPE "AssetType_new" USING ("type"::text::"AssetType_new");
ALTER TYPE "AssetType" RENAME TO "AssetType_old";
ALTER TYPE "AssetType_new" RENAME TO "AssetType";
DROP TYPE "AssetType_old";
ALTER TABLE "assets" ALTER COLUMN "type" SET DEFAULT 'TEXT';

-- AlterTable: drop the image/text job-type column and its enum
ALTER TABLE "generation_jobs" DROP COLUMN "type";
DROP TYPE "GenerationJobType";

-- AlterTable: revision tracking for the client review cycle
ALTER TABLE "tasks" ADD COLUMN "max_revisions" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "tasks" ADD COLUMN "revisions_used" INTEGER NOT NULL DEFAULT 0;
