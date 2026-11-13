-- CreateTable
CREATE TABLE "auth_devices" (
    "id" SERIAL NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_accounts" (
    "id" SERIAL NOT NULL,
    "device_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "refresh_hash" TEXT NOT NULL,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_devices_token_hash_key" ON "auth_devices"("token_hash");

-- CreateIndex
CREATE INDEX "device_accounts_user_id_idx" ON "device_accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_accounts_device_id_user_id_key" ON "device_accounts"("device_id", "user_id");

-- AddForeignKey
ALTER TABLE "device_accounts" ADD CONSTRAINT "device_accounts_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "auth_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_accounts" ADD CONSTRAINT "device_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
