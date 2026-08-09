-- CreateEnum
CREATE TYPE "GenerationJobType" AS ENUM ('TEXT', 'IMAGE');

-- AlterEnum
ALTER TYPE "AssetType" ADD VALUE 'IMAGE';

-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "storage_path" TEXT,
ALTER COLUMN "content" DROP NOT NULL;

-- AlterTable
ALTER TABLE "generation_jobs" ADD COLUMN     "type" "GenerationJobType" NOT NULL DEFAULT 'TEXT';
