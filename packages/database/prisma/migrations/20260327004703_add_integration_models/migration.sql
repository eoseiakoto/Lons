-- CreateEnum
CREATE TYPE "WalletAuthType" AS ENUM ('api_key', 'oauth2', 'basic', 'bearer');

-- CreateTable
CREATE TABLE "wallet_provider_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "provider_name" VARCHAR(100) NOT NULL,
    "auth_type" "WalletAuthType" NOT NULL,
    "base_url" VARCHAR(500) NOT NULL,
    "config_json" JSONB NOT NULL,
    "request_mapping" JSONB NOT NULL,
    "response_mapping" JSONB NOT NULL,
    "webhook_config" JSONB,
    "resilience" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "wallet_provider_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_bureau_consents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "bureau_type" VARCHAR(50) NOT NULL,
    "consent_given" BOOLEAN NOT NULL DEFAULT true,
    "consent_date" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "credit_bureau_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_api_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "provider" VARCHAR(100) NOT NULL,
    "endpoint" VARCHAR(500) NOT NULL,
    "method" VARCHAR(10) NOT NULL,
    "request_headers" JSONB,
    "request_body" JSONB,
    "response_status" INTEGER,
    "response_body" JSONB,
    "latency_ms" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "error_message" TEXT,
    "correlation_id" VARCHAR(100),
    "circuit_breaker_state" VARCHAR(20),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_api_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wallet_provider_configs_tenant_id_idx" ON "wallet_provider_configs"("tenant_id");

-- CreateIndex
CREATE INDEX "wallet_provider_configs_is_active_idx" ON "wallet_provider_configs"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_provider_configs_tenant_id_provider_name_key" ON "wallet_provider_configs"("tenant_id", "provider_name");

-- CreateIndex
CREATE INDEX "credit_bureau_consents_tenant_id_customer_id_idx" ON "credit_bureau_consents"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "credit_bureau_consents_bureau_type_idx" ON "credit_bureau_consents"("bureau_type");

-- CreateIndex
CREATE INDEX "credit_bureau_consents_expires_at_idx" ON "credit_bureau_consents"("expires_at");

-- CreateIndex
CREATE INDEX "integration_api_logs_tenant_id_provider_idx" ON "integration_api_logs"("tenant_id", "provider");

-- CreateIndex
CREATE INDEX "integration_api_logs_created_at_idx" ON "integration_api_logs"("created_at");

-- CreateIndex
CREATE INDEX "integration_api_logs_success_idx" ON "integration_api_logs"("success");

-- CreateIndex
CREATE INDEX "integration_api_logs_provider_created_at_idx" ON "integration_api_logs"("provider", "created_at");

-- AddForeignKey
ALTER TABLE "credit_bureau_consents" ADD CONSTRAINT "credit_bureau_consents_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
