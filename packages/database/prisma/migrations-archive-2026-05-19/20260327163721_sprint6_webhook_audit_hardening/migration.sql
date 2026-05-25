-- CreateEnum
CREATE TYPE "WebhookAuthMethod" AS ENUM ('hmac', 'bearer', 'basic_auth');

-- CreateTable
CREATE TABLE "webhook_endpoints" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "events" TEXT[],
    "auth_method" "WebhookAuthMethod" NOT NULL DEFAULT 'hmac',
    "secret" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_delivery_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "webhook_endpoint_id" UUID NOT NULL,
    "event" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "http_status" INTEGER,
    "response_body" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'pending',
    "next_retry_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_delivery_logs_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Add hash chaining and access type to audit_logs
ALTER TABLE "audit_logs" ADD COLUMN "previous_hash" CHAR(64);
ALTER TABLE "audit_logs" ADD COLUMN "entry_hash" CHAR(64);
ALTER TABLE "audit_logs" ADD COLUMN "access_type" VARCHAR(30);

-- CreateIndex
CREATE INDEX "webhook_endpoints_tenant_id_idx" ON "webhook_endpoints"("tenant_id");
CREATE INDEX "webhook_endpoints_tenant_id_active_idx" ON "webhook_endpoints"("tenant_id", "active");

CREATE INDEX "webhook_delivery_logs_webhook_endpoint_id_idx" ON "webhook_delivery_logs"("webhook_endpoint_id");
CREATE INDEX "webhook_delivery_logs_status_idx" ON "webhook_delivery_logs"("status");
CREATE INDEX "webhook_delivery_logs_webhook_endpoint_id_status_created_at_idx" ON "webhook_delivery_logs"("webhook_endpoint_id", "status", "created_at");

CREATE INDEX "audit_logs_entry_hash_idx" ON "audit_logs"("entry_hash");

-- AddForeignKey
ALTER TABLE "webhook_delivery_logs" ADD CONSTRAINT "webhook_delivery_logs_webhook_endpoint_id_fkey" FOREIGN KEY ("webhook_endpoint_id") REFERENCES "webhook_endpoints"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
