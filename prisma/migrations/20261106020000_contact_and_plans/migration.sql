CREATE TYPE "ContactStatus" AS ENUM ('NEW', 'READ', 'RESOLVED');

CREATE TABLE "contact_messages" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "name" VARCHAR(80) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "subject" VARCHAR(120) NOT NULL,
    "message" VARCHAR(2000) NOT NULL,
    "status" "ContactStatus" NOT NULL DEFAULT 'NEW',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contact_messages_status_created_at_idx" ON "contact_messages"("status", "created_at");
CREATE INDEX "contact_messages_email_created_at_idx" ON "contact_messages"("email", "created_at");

ALTER TABLE "contact_messages" ADD CONSTRAINT "contact_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "subscription_plan" ("name", "description", "price", "currency", "duration_days", "is_active", "features", "ad_limit", "featured_placement", "visibility_boost", "created_at", "updated_at")
VALUES
  ('Free', 'Essential features for getting started', 0, 'SAR', 0, true, ARRAY['50 advertisements', '0% visibility boost']::text[], 50, false, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('Premium', 'Unlimited advertisements and higher visibility', 49.00, 'SAR', 30, true, ARRAY['Unlimited advertisements', '50% visibility boost']::text[], -1, false, 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('Premium Yearly', 'Unlimited advertisements and higher visibility', 470.00, 'SAR', 365, true, ARRAY['Unlimited advertisements', '50% visibility boost']::text[], -1, false, 50, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO UPDATE SET
  "ad_limit" = EXCLUDED."ad_limit",
  "visibility_boost" = EXCLUDED."visibility_boost",
  "updated_at" = CURRENT_TIMESTAMP;
