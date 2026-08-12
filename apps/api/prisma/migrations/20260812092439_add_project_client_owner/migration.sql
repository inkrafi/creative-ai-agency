-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "client_owner_id" UUID;

-- CreateIndex
CREATE INDEX "projects_client_owner_id_idx" ON "projects"("client_owner_id");
