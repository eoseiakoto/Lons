/*
  Warnings:

  - You are about to drop the column `auth_type` on the `wallet_provider_configs` table. All the data in the column will be lost.
  - You are about to drop the column `base_url` on the `wallet_provider_configs` table. All the data in the column will be lost.
  - You are about to drop the column `provider_name` on the `wallet_provider_configs` table. All the data in the column will be lost.
  - You are about to drop the column `request_mapping` on the `wallet_provider_configs` table. All the data in the column will be lost.
  - You are about to drop the column `resilience` on the `wallet_provider_configs` table. All the data in the column will be lost.
  - You are about to drop the column `response_mapping` on the `wallet_provider_configs` table. All the data in the column will be lost.
  - You are about to drop the column `webhook_config` on the `wallet_provider_configs` table. All the data in the column will be lost.
  - You are about to drop the `alert_rules` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `api_keys` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `credit_bureau_consents` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `integration_api_logs` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `monitoring_alerts` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `notification_templates` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `recovery_outcomes` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `refresh_tokens` table. If the table is not empty, all the data it contains will be lost.
  - Made the column `is_default` on table `wallet_provider_configs` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('announcement', 'direct', 'system');

-- CreateEnum
CREATE TYPE "MessagePriority" AS ENUM ('low', 'normal', 'high', 'urgent');

-- DropForeignKey
ALTER TABLE "credit_bureau_consents" DROP CONSTRAINT "credit_bureau_consents_customer_id_fkey";

-- DropForeignKey
ALTER TABLE "monitoring_alerts" DROP CONSTRAINT "monitoring_alerts_alert_rule_id_fkey";

-- DropForeignKey
ALTER TABLE "monitoring_alerts" DROP CONSTRAINT "monitoring_alerts_contract_id_fkey";

-- DropForeignKey
ALTER TABLE "monitoring_alerts" DROP CONSTRAINT "monitoring_alerts_customer_id_fkey";

-- DropForeignKey
ALTER TABLE "recovery_outcomes" DROP CONSTRAINT "recovery_outcomes_contract_id_fkey";

-- DropIndex
DROP INDEX "wallet_provider_configs_is_active_idx";

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "platform_fee_percent" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "wallet_provider_configs" DROP COLUMN "auth_type",
DROP COLUMN "base_url",
DROP COLUMN "provider_name",
DROP COLUMN "request_mapping",
DROP COLUMN "resilience",
DROP COLUMN "response_mapping",
DROP COLUMN "webhook_config",
ALTER COLUMN "is_default" SET NOT NULL;

-- DropTable
DROP TABLE "alert_rules";

-- DropTable
DROP TABLE "api_keys";

-- DropTable
DROP TABLE "credit_bureau_consents";

-- DropTable
DROP TABLE "integration_api_logs";

-- DropTable
DROP TABLE "monitoring_alerts";

-- DropTable
DROP TABLE "notification_templates";

-- DropTable
DROP TABLE "recovery_outcomes";

-- DropTable
DROP TABLE "refresh_tokens";

-- DropEnum
DROP TYPE "AdaptiveActionType";

-- DropEnum
DROP TYPE "AlertSeverity";

-- DropEnum
DROP TYPE "AlertStatus";

-- DropEnum
DROP TYPE "RecoveryOutcomeStatus";

-- DropEnum
DROP TYPE "RecoveryStrategyType";

-- DropEnum
DROP TYPE "ScoringStrategy";

-- DropEnum
DROP TYPE "WalletAuthType";

-- CreateTable
CREATE TABLE "platform_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "MessageType" NOT NULL,
    "priority" "MessagePriority" NOT NULL DEFAULT 'normal',
    "subject" VARCHAR(500) NOT NULL,
    "body" TEXT NOT NULL,
    "sender_type" VARCHAR(50) NOT NULL,
    "sender_id" UUID NOT NULL,
    "sender_name" VARCHAR(255),
    "tenant_id" UUID,
    "metadata" JSONB,
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "platform_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_recipients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "message_id" UUID NOT NULL,
    "recipient_type" VARCHAR(50) NOT NULL,
    "recipient_id" UUID NOT NULL,
    "tenant_id" UUID,
    "read_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_messages_tenant_id_idx" ON "platform_messages"("tenant_id");

-- CreateIndex
CREATE INDEX "platform_messages_type_idx" ON "platform_messages"("type");

-- CreateIndex
CREATE INDEX "platform_messages_created_at_idx" ON "platform_messages"("created_at");

-- CreateIndex
CREATE INDEX "message_recipients_recipient_id_read_at_idx" ON "message_recipients"("recipient_id", "read_at");

-- CreateIndex
CREATE INDEX "message_recipients_tenant_id_idx" ON "message_recipients"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "message_recipients_message_id_recipient_id_key" ON "message_recipients"("message_id", "recipient_id");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_idx" ON "audit_logs"("tenant_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_resource_type_resource_id_idx" ON "audit_logs"("resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entry_hash_idx" ON "audit_logs"("entry_hash");

-- AddForeignKey
ALTER TABLE "wallet_provider_configs" ADD CONSTRAINT "wallet_provider_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_recipients" ADD CONSTRAINT "message_recipients_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "platform_messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "uq_notification_provider_active" RENAME TO "notification_provider_configs_tenant_id_provider_type_is_ac_key";

-- RenameIndex
ALTER INDEX "uq_wallet_provider_active" RENAME TO "wallet_provider_configs_tenant_id_provider_type_is_active_key";
