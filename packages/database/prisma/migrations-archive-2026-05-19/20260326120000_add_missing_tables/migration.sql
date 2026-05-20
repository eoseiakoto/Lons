-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('calculated', 'approved', 'executing', 'settled', 'failed');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "slug" VARCHAR(63) NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "settlement_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'calculated',
    "total_revenue" DECIMAL(19,4) NOT NULL,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "settlement_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "settlement_run_id" UUID NOT NULL,
    "party_type" VARCHAR(50) NOT NULL,
    "party_id" UUID NOT NULL,
    "gross_revenue" DECIMAL(19,4) NOT NULL,
    "share_percentage" DECIMAL(5,2) NOT NULL,
    "share_amount" DECIMAL(19,4) NOT NULL,
    "deductions" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(19,4) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "run_date" TIMESTAMPTZ(6) NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "match_rate" DECIMAL(5,2),
    "total_txns" INTEGER NOT NULL,
    "matched_txns" INTEGER NOT NULL,
    "exception_count" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_exceptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "reconciliation_run_id" UUID NOT NULL,
    "contract_id" UUID,
    "txn_type" VARCHAR(50) NOT NULL,
    "external_ref" VARCHAR(255),
    "exception_type" VARCHAR(50) NOT NULL,
    "severity" VARCHAR(50) NOT NULL,
    "amount" DECIMAL(19,4),
    "description" TEXT,
    "investigation" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collections_actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "action_type" VARCHAR(50) NOT NULL,
    "notes" TEXT,
    "actor_id" UUID,
    "promise_date" TIMESTAMPTZ(6),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collections_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "settlement_runs_tenant_id_idx" ON "settlement_runs"("tenant_id");

-- CreateIndex
CREATE INDEX "settlement_runs_status_idx" ON "settlement_runs"("status");

-- CreateIndex
CREATE INDEX "settlement_lines_tenant_id_idx" ON "settlement_lines"("tenant_id");

-- CreateIndex
CREATE INDEX "settlement_lines_settlement_run_id_idx" ON "settlement_lines"("settlement_run_id");

-- CreateIndex
CREATE INDEX "reconciliation_runs_tenant_id_idx" ON "reconciliation_runs"("tenant_id");

-- CreateIndex
CREATE INDEX "reconciliation_runs_run_date_idx" ON "reconciliation_runs"("run_date");

-- CreateIndex
CREATE INDEX "reconciliation_exceptions_tenant_id_idx" ON "reconciliation_exceptions"("tenant_id");

-- CreateIndex
CREATE INDEX "reconciliation_exceptions_reconciliation_run_id_idx" ON "reconciliation_exceptions"("reconciliation_run_id");

-- CreateIndex
CREATE INDEX "reconciliation_exceptions_severity_idx" ON "reconciliation_exceptions"("severity");

-- CreateIndex
CREATE INDEX "reconciliation_exceptions_resolved_idx" ON "reconciliation_exceptions"("resolved");

-- CreateIndex
CREATE INDEX "collections_actions_tenant_id_idx" ON "collections_actions"("tenant_id");

-- CreateIndex
CREATE INDEX "collections_actions_contract_id_idx" ON "collections_actions"("contract_id");

-- CreateIndex
CREATE INDEX "collections_actions_action_type_idx" ON "collections_actions"("action_type");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- AddForeignKey
ALTER TABLE "settlement_lines" ADD CONSTRAINT "settlement_lines_settlement_run_id_fkey" FOREIGN KEY ("settlement_run_id") REFERENCES "settlement_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_exceptions" ADD CONSTRAINT "reconciliation_exceptions_reconciliation_run_id_fkey" FOREIGN KEY ("reconciliation_run_id") REFERENCES "reconciliation_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections_actions" ADD CONSTRAINT "collections_actions_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
