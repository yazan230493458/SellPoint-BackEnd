/*
  Warnings:

  - You are about to drop the column `featured_until` on the `ads` table. All the data in the column will be lost.
  - You are about to drop the column `is_featured` on the `ads` table. All the data in the column will be lost.
  - You are about to drop the column `allows_featured_ads` on the `subscription_plan` table. All the data in the column will be lost.
  - You are about to drop the column `featured_ad_limit` on the `subscription_plan` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "ads_featured_until_idx";

-- DropIndex
DROP INDEX "ads_is_featured_is_active_idx";

-- AlterTable
ALTER TABLE "ads" DROP COLUMN "featured_until",
DROP COLUMN "is_featured";

-- AlterTable
ALTER TABLE "subscription_plan" DROP COLUMN "allows_featured_ads",
DROP COLUMN "featured_ad_limit",
ADD COLUMN     "ad_limit" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "featured_placement" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "visibility_boost" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "ads_is_active_idx" ON "ads"("is_active");
