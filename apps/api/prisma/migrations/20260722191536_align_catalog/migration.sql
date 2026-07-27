/*
  Warnings:

  - You are about to drop the column `role` on the `contacts` table. All the data in the column will be lost.
  - You are about to drop the column `yachtway_logins` on the `contacts` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "active_company_status" TEXT,
ADD COLUMN     "spotlight_ctr" DECIMAL(6,3),
ADD COLUMN     "top_spotlight_url" TEXT,
ADD COLUMN     "total_video_views_30d" DECIMAL(65,30),
ADD COLUMN     "video_views_by_platform" TEXT;

-- AlterTable
ALTER TABLE "contacts" DROP COLUMN "role",
DROP COLUMN "yachtway_logins",
ADD COLUMN     "platform_role" TEXT,
ADD COLUMN     "total_logins" DECIMAL(65,30);

-- AlterTable
ALTER TABLE "opportunities" ADD COLUMN     "opportunity_pipeline" TEXT;

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CompanyTags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_CompanyTags_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ContactTags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ContactTags_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE INDEX "_CompanyTags_B_index" ON "_CompanyTags"("B");

-- CreateIndex
CREATE INDEX "_ContactTags_B_index" ON "_ContactTags"("B");

-- AddForeignKey
ALTER TABLE "_CompanyTags" ADD CONSTRAINT "_CompanyTags_A_fkey" FOREIGN KEY ("A") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CompanyTags" ADD CONSTRAINT "_CompanyTags_B_fkey" FOREIGN KEY ("B") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ContactTags" ADD CONSTRAINT "_ContactTags_A_fkey" FOREIGN KEY ("A") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ContactTags" ADD CONSTRAINT "_ContactTags_B_fkey" FOREIGN KEY ("B") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
