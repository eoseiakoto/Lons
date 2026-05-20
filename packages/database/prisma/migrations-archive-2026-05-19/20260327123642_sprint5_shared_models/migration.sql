-- CreateEnum
CREATE TYPE "RecoveryStrategyType" AS ENUM ('grace_period', 'restructure', 'partial_settlement', 'fee_recovery', 'escalation', 'payment_holiday');

-- CreateEnum
CREATE TYPE "RecoveryOutcomeStatus" AS ENUM ('pending', 'success', 'partial', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('info', 'warning', 'critical');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('active', 'acknowledged', 'resolved');

-- CreateEnum
CREATE TYPE "AdaptiveActionType" AS ENUM ('credit_freeze', 'schedule_adjustment', 'early_warning', 'recovery_escalation');

-- CreateEnum
CREATE TYPE "ScoringStrategy" AS ENUM ('rule_only', 'ml_only', 'higher', 'lower', 'weighted_average');

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "product_id" UUID,
    "event_type" VARCHAR(100) NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "template_body" TEXT NOT NULL,
    "language" VARCHAR(10) NOT NULL DEFAULT 'en',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recovery_outcomes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "strategy_type" "RecoveryStrategyType" NOT NULL,
    "strategy_params" JSONB,
    "status" "RecoveryOutcomeStatus" NOT NULL DEFAULT 'pending',
    "amount_recovered" DECIMAL(19,4),
    "days_to_resolution" INTEGER,
    "notes" TEXT,
    "applied_by" UUID,
    "applied_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "recovery_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "product_id" UUID,
    "risk_tier" VARCHAR(20),
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "condition_type" VARCHAR(100) NOT NULL,
    "condition_config" JSONB NOT NULL,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'warning',
    "action_type" "AdaptiveActionType",
    "action_config" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monitoring_alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "alert_rule_id" UUID,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'warning',
    "status" "AlertStatus" NOT NULL DEFAULT 'active',
    "risk_score" INTEGER NOT NULL,
    "risk_level" VARCHAR(20) NOT NULL,
    "factors" JSONB NOT NULL,
    "action_taken" VARCHAR(100),
    "acknowledged_by" UUID,
    "acknowledged_at" TIMESTAMPTZ(6),
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monitoring_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_templates_tenant_id_idx" ON "notification_templates"("tenant_id");

-- CreateIndex
CREATE INDEX "notification_templates_tenant_id_event_type_channel_idx" ON "notification_templates"("tenant_id", "event_type", "channel");

-- CreateIndex
CREATE INDEX "notification_templates_product_id_idx" ON "notification_templates"("product_id");

-- CreateIndex
CREATE INDEX "recovery_outcomes_tenant_id_idx" ON "recovery_outcomes"("tenant_id");

-- CreateIndex
CREATE INDEX "recovery_outcomes_contract_id_idx" ON "recovery_outcomes"("contract_id");

-- CreateIndex
CREATE INDEX "recovery_outcomes_strategy_type_idx" ON "recovery_outcomes"("strategy_type");

-- CreateIndex
CREATE INDEX "recovery_outcomes_status_idx" ON "recovery_outcomes"("status");

-- CreateIndex
CREATE INDEX "alert_rules_tenant_id_idx" ON "alert_rules"("tenant_id");

-- CreateIndex
CREATE INDEX "alert_rules_is_active_idx" ON "alert_rules"("is_active");

-- CreateIndex
CREATE INDEX "monitoring_alerts_tenant_id_idx" ON "monitoring_alerts"("tenant_id");

-- CreateIndex
CREATE INDEX "monitoring_alerts_contract_id_idx" ON "monitoring_alerts"("contract_id");

-- CreateIndex
CREATE INDEX "monitoring_alerts_status_idx" ON "monitoring_alerts"("status");

-- CreateIndex
CREATE INDEX "monitoring_alerts_severity_idx" ON "monitoring_alerts"("severity");

-- CreateIndex
CREATE INDEX "monitoring_alerts_created_at_idx" ON "monitoring_alerts"("created_at");

-- AddForeignKey
ALTER TABLE "recovery_outcomes" ADD CONSTRAINT "recovery_outcomes_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitoring_alerts" ADD CONSTRAINT "monitoring_alerts_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitoring_alerts" ADD CONSTRAINT "monitoring_alerts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monitoring_alerts" ADD CONSTRAINT "monitoring_alerts_alert_rule_id_fkey" FOREIGN KEY ("alert_rule_id") REFERENCES "alert_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
