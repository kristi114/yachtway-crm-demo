/*
  Warnings:

  - A unique constraint covering the columns `[name_key]` on the table `tags` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `name_key` to the `tags` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "tags_name_key";

-- AlterTable
ALTER TABLE "tags" ADD COLUMN     "name_key" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key_key" ON "tags"("name_key");
