-- AlterTable
ALTER TABLE "reviews" ADD COLUMN "ad_id" INTEGER;

-- DropIndex
DROP INDEX "reviews_reviewer_id_reviewed_user_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "reviews_reviewer_id_reviewed_user_id_ad_id_key" ON "reviews"("reviewer_id", "reviewed_user_id", "ad_id");

-- CreateIndex
CREATE INDEX "reviews_ad_id_idx" ON "reviews"("ad_id");

-- One account review per reviewer and seller. Advertisement reviews are stored separately.
CREATE UNIQUE INDEX "reviews_account_review_key" ON "reviews"("reviewer_id", "reviewed_user_id") WHERE "ad_id" IS NULL;

-- One review per user for each advertisement.
CREATE UNIQUE INDEX "reviews_advertisement_review_key" ON "reviews"("reviewer_id", "ad_id") WHERE "ad_id" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "ads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
