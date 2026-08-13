-- Renaming (not dropping) WEBSITE -> LANDING_PAGE so existing briefs keep
-- their data intact and simply read under the new label. RENAME VALUE
-- updates every existing row's enum value in place -- no DELETE/backfill
-- needed this time, unlike the original brief_type_and_context migration.
ALTER TYPE "BriefType" RENAME VALUE 'WEBSITE' TO 'LANDING_PAGE';

-- AlterEnum
ALTER TYPE "BriefType" ADD VALUE 'VIDEO';
