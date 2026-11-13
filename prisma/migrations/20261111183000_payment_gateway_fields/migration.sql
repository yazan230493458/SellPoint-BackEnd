-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "currency" SET DEFAULT 'SAR';

-- AlterTable
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "provider_intent_id" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "payment_method" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "payments_provider_intent_id_key" ON "payments"("provider_intent_id");

-- CreateTable
CREATE TABLE IF NOT EXISTS "payment_webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payment_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payment_webhook_events_provider_created_at_idx" ON "payment_webhook_events"("provider", "created_at");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_webhook_events_payment_id_fkey'
  ) THEN
    ALTER TABLE "payment_webhook_events"
      ADD CONSTRAINT "payment_webhook_events_payment_id_fkey"
      FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
