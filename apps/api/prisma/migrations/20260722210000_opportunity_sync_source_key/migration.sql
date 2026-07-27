-- AlterTable
ALTER TABLE "opportunities" ADD COLUMN "sync_source_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "opportunities_sync_source_key_key" ON "opportunities"("sync_source_key");
