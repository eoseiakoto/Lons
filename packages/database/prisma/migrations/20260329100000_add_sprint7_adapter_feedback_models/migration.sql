-- CreateEnum
CREATE TYPE "WalletProviderType" AS ENUM ('MOCK', 'MTN_MOMO', 'MPESA', 'AIRTEL_MONEY', 'GENERIC');
CREATE TYPE "NotificationProviderType" AS ENUM ('CONSOLE', 'RECORDING_MOCK', 'AFRICAS_TALKING', 'TWILIO', 'SMTP', 'FCM');
CREATE TYPE "AdapterEnvironmentMode" AS ENUM ('SANDBOX', 'PRODUCTION');
CREATE TYPE "FeedbackCategory" AS ENUM ('BUG', 'FEATURE_REQUEST', 'UX_ISSUE', 'INTEGRATION_QUESTION', 'OTHER');
CREATE TYPE "FeedbackSeverity" AS ENUM ('CRITICAL', 'MAJOR', 'MINOR', 'SUGGESTION');
CREATE TYPE "FeedbackStatus" AS ENUM ('NEW', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateTable: wallet_provider_configs
CREATE TABLE "wallet_provider_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "provider_type" "WalletProviderType" NOT NULL,
    "environment_mode" "AdapterEnvironmentMode" NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "api_base_url" VARCHAR(512),
    "credentials_secret_ref" VARCHAR(512),
    "webhook_signing_key_ref" VARCHAR(512),
    "config_json" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "wallet_provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: notification_provider_configs
CREATE TABLE "notification_provider_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "provider_type" "NotificationProviderType" NOT NULL,
    "environment_mode" "AdapterEnvironmentMode" NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "credentials_secret_ref" VARCHAR(512),
    "config_json" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "notification_provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: notification_mock_log
CREATE TABLE "notification_mock_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "channel" VARCHAR(20) NOT NULL,
    "recipient" VARCHAR(255) NOT NULL,
    "template_id" VARCHAR(100),
    "rendered_content" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "correlation_id" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_mock_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable: feedbacks
CREATE TABLE "feedbacks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "category" "FeedbackCategory" NOT NULL,
    "severity" "FeedbackSeverity" NOT NULL,
    "description" TEXT NOT NULL,
    "screenshot_url" VARCHAR(512),
    "page_url" VARCHAR(512),
    "debug_context" JSONB,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'NEW',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable: survey_responses
CREATE TABLE "survey_responses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wallet_provider_configs_tenant_id_idx" ON "wallet_provider_configs"("tenant_id");
CREATE UNIQUE INDEX "uq_wallet_provider_active" ON "wallet_provider_configs"("tenant_id", "provider_type", "is_active");

CREATE INDEX "notification_provider_configs_tenant_id_idx" ON "notification_provider_configs"("tenant_id");
CREATE UNIQUE INDEX "uq_notification_provider_active" ON "notification_provider_configs"("tenant_id", "provider_type", "is_active");

CREATE INDEX "notification_mock_log_tenant_id_idx" ON "notification_mock_log"("tenant_id");
CREATE INDEX "notification_mock_log_correlation_id_idx" ON "notification_mock_log"("correlation_id");

CREATE INDEX "feedbacks_tenant_id_idx" ON "feedbacks"("tenant_id");
CREATE INDEX "feedbacks_status_idx" ON "feedbacks"("status");

CREATE INDEX "survey_responses_tenant_id_idx" ON "survey_responses"("tenant_id");

-- AddForeignKey
ALTER TABLE "wallet_provider_configs" ADD CONSTRAINT "wallet_provider_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification_provider_configs" ADD CONSTRAINT "notification_provider_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "notification_mock_log" ADD CONSTRAINT "notification_mock_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Row-Level Security
ALTER TABLE "wallet_provider_configs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY wallet_provider_configs_tenant_isolation ON "wallet_provider_configs"
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

ALTER TABLE "notification_provider_configs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_provider_configs_tenant_isolation ON "notification_provider_configs"
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

ALTER TABLE "notification_mock_log" ENABLE ROW LEVEL SECURITY;
CREATE POLICY notification_mock_log_tenant_isolation ON "notification_mock_log"
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

ALTER TABLE "feedbacks" ENABLE ROW LEVEL SECURITY;
CREATE POLICY feedbacks_tenant_isolation ON "feedbacks"
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

ALTER TABLE "survey_responses" ENABLE ROW LEVEL SECURITY;
CREATE POLICY survey_responses_tenant_isolation ON "survey_responses"
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
