-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('provisioning', 'active', 'suspended', 'decommissioned');

-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('starter', 'professional', 'enterprise');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'suspended', 'deactivated');

-- CreateEnum
CREATE TYPE "PlatformUserRole" AS ENUM ('platform_admin', 'platform_support');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('overdraft', 'micro_loan', 'bnpl', 'invoice_financing');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('draft', 'active', 'suspended', 'discontinued');

-- CreateEnum
CREATE TYPE "InterestRateModel" AS ENUM ('flat', 'reducing_balance', 'tiered');

-- CreateEnum
CREATE TYPE "RepaymentMethod" AS ENUM ('lump_sum', 'equal_installments', 'reducing', 'balloon', 'auto_deduction');

-- CreateEnum
CREATE TYPE "ApprovalWorkflow" AS ENUM ('auto', 'semi_auto', 'single_level', 'multi_level');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('active', 'suspended', 'blacklisted', 'inactive');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'other', 'undisclosed');

-- CreateEnum
CREATE TYPE "KycLevel" AS ENUM ('none', 'tier_1', 'tier_2', 'tier_3');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('data_access', 'auto_deduction', 'credit_reporting', 'alternative_data', 'communications');

-- CreateEnum
CREATE TYPE "LenderStatus" AS ENUM ('active', 'suspended', 'inactive');

-- CreateEnum
CREATE TYPE "LoanRequestStatus" AS ENUM ('received', 'validated', 'pre_qualified', 'scored', 'approved', 'rejected', 'manual_review', 'offer_sent', 'accepted', 'declined', 'expired', 'contract_created', 'disbursing', 'disbursed', 'disbursement_failed', 'cancelled');

-- CreateEnum
CREATE TYPE "ScoringModelType" AS ENUM ('rule_based', 'ml_model', 'hybrid');

-- CreateEnum
CREATE TYPE "RiskTier" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "ScoringContext" AS ENUM ('application', 'review', 'renewal', 'monitoring');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('active', 'performing', 'due', 'overdue', 'delinquent', 'default_status', 'written_off', 'settled', 'cancelled');

-- CreateEnum
CREATE TYPE "ContractClassification" AS ENUM ('performing', 'special_mention', 'substandard', 'doubtful', 'loss');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'suspended', 'deactivated');

-- CreateEnum
CREATE TYPE "RepaymentScheduleStatus" AS ENUM ('pending', 'partial', 'paid', 'overdue', 'waived');

-- CreateEnum
CREATE TYPE "RepaymentStatus" AS ENUM ('pending', 'processing', 'completed', 'failed', 'reversed');

-- CreateEnum
CREATE TYPE "RepaymentMethodType" AS ENUM ('auto_deduction', 'manual', 'bulk', 'third_party', 'fee_recovery');

-- CreateEnum
CREATE TYPE "DisbursementStatus" AS ENUM ('pending', 'processing', 'completed', 'failed', 'reversed');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('disbursement', 'interest_accrual', 'fee', 'penalty', 'repayment', 'adjustment', 'write_off', 'reversal');

-- CreateEnum
CREATE TYPE "DebitCredit" AS ENUM ('debit', 'credit');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('user', 'system', 'api_key');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('sms', 'push', 'email', 'in_app');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('pending', 'sent', 'delivered', 'failed', 'bounced');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('pending', 'delivered', 'failed', 'exhausted');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "legal_name" VARCHAR(255),
    "registration_number" VARCHAR(100),
    "country" VARCHAR(3) NOT NULL,
    "schema_name" VARCHAR(63) NOT NULL,
    "plan_tier" "PlanTier" NOT NULL DEFAULT 'starter',
    "status" "TenantStatus" NOT NULL DEFAULT 'provisioning',
    "settings" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255),
    "role" "PlatformUserRole" NOT NULL,
    "mfa_secret" VARCHAR(255),
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMPTZ(6),
    "locked_until" TIMESTAMPTZ(6),
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "platform_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255),
    "role_id" UUID NOT NULL,
    "mfa_secret" VARCHAR(255),
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "last_login_at" TIMESTAMPTZ(6),
    "locked_until" TIMESTAMPTZ(6),
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lenders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "license_number" VARCHAR(100),
    "country" VARCHAR(3),
    "funding_capacity" DECIMAL(19,4),
    "funding_currency" VARCHAR(3),
    "min_interest_rate" DECIMAL(7,4),
    "max_interest_rate" DECIMAL(7,4),
    "settlement_account" JSONB,
    "risk_parameters" JSONB,
    "status" "LenderStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "lenders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "external_id" VARCHAR(255) NOT NULL,
    "external_source" VARCHAR(100),
    "full_name" VARCHAR(255),
    "date_of_birth" DATE,
    "gender" "Gender",
    "national_id" VARCHAR(255),
    "national_id_type" VARCHAR(50),
    "phone_primary" VARCHAR(50),
    "phone_secondary" VARCHAR(50),
    "email" VARCHAR(255),
    "country" VARCHAR(3),
    "region" VARCHAR(100),
    "city" VARCHAR(100),
    "kyc_level" "KycLevel" NOT NULL DEFAULT 'none',
    "kyc_verified_at" TIMESTAMPTZ(6),
    "segment" VARCHAR(100),
    "status" "CustomerStatus" NOT NULL DEFAULT 'active',
    "blacklist_reason" TEXT,
    "watchlist" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_consents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "consent_type" "ConsentType" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "granted_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "channel" VARCHAR(50),
    "version" INTEGER NOT NULL DEFAULT 1,
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customer_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "type" "ProductType" NOT NULL,
    "lender_id" UUID,
    "currency" VARCHAR(3) NOT NULL,
    "min_amount" DECIMAL(19,4),
    "max_amount" DECIMAL(19,4),
    "min_tenor_days" INTEGER,
    "max_tenor_days" INTEGER,
    "interest_rate_model" "InterestRateModel" NOT NULL,
    "interest_rate" DECIMAL(7,4),
    "rate_tiers" JSONB,
    "fee_structure" JSONB,
    "repayment_method" "RepaymentMethod" NOT NULL,
    "grace_period_days" INTEGER NOT NULL DEFAULT 0,
    "penalty_config" JSONB,
    "approval_workflow" "ApprovalWorkflow" NOT NULL DEFAULT 'auto',
    "approval_thresholds" JSONB,
    "scoring_model_id" VARCHAR(100),
    "eligibility_rules" JSONB,
    "revenue_sharing" JSONB,
    "notification_config" JSONB,
    "cooling_off_hours" INTEGER NOT NULL DEFAULT 0,
    "max_active_loans" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "ProductStatus" NOT NULL DEFAULT 'draft',
    "activated_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "change_summary" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "credit_limit" DECIMAL(19,4),
    "available_limit" DECIMAL(19,4),
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
    "activated_at" TIMESTAMPTZ(6),
    "deactivated_at" TIMESTAMPTZ(6),
    "last_limit_review" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(255),
    "customer_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "product_version" INTEGER,
    "requested_amount" DECIMAL(19,4) NOT NULL,
    "requested_tenor" INTEGER,
    "currency" VARCHAR(3) NOT NULL,
    "channel" VARCHAR(50),
    "status" "LoanRequestStatus" NOT NULL DEFAULT 'received',
    "rejection_reasons" JSONB,
    "scoring_result_id" UUID,
    "approved_amount" DECIMAL(19,4),
    "approved_tenor" INTEGER,
    "offer_details" JSONB,
    "offer_expires_at" TIMESTAMPTZ(6),
    "accepted_at" TIMESTAMPTZ(6),
    "contract_id" UUID,
    "processed_by" UUID,
    "processing_notes" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "loan_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scoring_results" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "model_type" "ScoringModelType" NOT NULL,
    "model_version" VARCHAR(50),
    "score" DECIMAL(7,2) NOT NULL,
    "score_range_min" DECIMAL(7,2) NOT NULL,
    "score_range_max" DECIMAL(7,2) NOT NULL,
    "probability_default" DECIMAL(5,4),
    "risk_tier" "RiskTier" NOT NULL,
    "recommended_limit" DECIMAL(19,4),
    "contributing_factors" JSONB,
    "input_features" JSONB,
    "confidence" DECIMAL(5,4),
    "context" "ScoringContext" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scoring_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "contract_number" VARCHAR(50) NOT NULL,
    "customer_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "product_version" INTEGER,
    "lender_id" UUID NOT NULL,
    "loan_request_id" UUID NOT NULL,
    "principal_amount" DECIMAL(19,4) NOT NULL,
    "interest_rate" DECIMAL(7,4) NOT NULL,
    "interest_amount" DECIMAL(19,4),
    "total_fees" DECIMAL(19,4),
    "total_cost_credit" DECIMAL(19,4),
    "currency" VARCHAR(3) NOT NULL,
    "tenor_days" INTEGER,
    "repayment_method" "RepaymentMethod" NOT NULL,
    "start_date" DATE NOT NULL,
    "maturity_date" DATE NOT NULL,
    "first_payment_date" DATE,
    "outstanding_principal" DECIMAL(19,4),
    "outstanding_interest" DECIMAL(19,4),
    "outstanding_fees" DECIMAL(19,4),
    "outstanding_penalties" DECIMAL(19,4),
    "total_outstanding" DECIMAL(19,4),
    "total_paid" DECIMAL(19,4),
    "days_past_due" INTEGER NOT NULL DEFAULT 0,
    "status" "ContractStatus" NOT NULL DEFAULT 'active',
    "classification" "ContractClassification" NOT NULL DEFAULT 'performing',
    "terms_snapshot" JSONB,
    "restructured" BOOLEAN NOT NULL DEFAULT false,
    "restructure_count" INTEGER NOT NULL DEFAULT 0,
    "disbursement_id" UUID,
    "metadata" JSONB,
    "settled_at" TIMESTAMPTZ(6),
    "defaulted_at" TIMESTAMPTZ(6),
    "written_off_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repayment_schedule" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "installment_number" INTEGER NOT NULL,
    "due_date" DATE NOT NULL,
    "principal_amount" DECIMAL(19,4),
    "interest_amount" DECIMAL(19,4),
    "fee_amount" DECIMAL(19,4),
    "total_amount" DECIMAL(19,4) NOT NULL,
    "paid_amount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "status" "RepaymentScheduleStatus" NOT NULL DEFAULT 'pending',
    "paid_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "repayment_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disbursements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "channel" VARCHAR(50),
    "destination" VARCHAR(255),
    "external_ref" VARCHAR(255),
    "status" "DisbursementStatus" NOT NULL DEFAULT 'pending',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "failure_reason" TEXT,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "disbursements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repayments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "method" "RepaymentMethodType" NOT NULL,
    "source" VARCHAR(50),
    "external_ref" VARCHAR(255),
    "allocated_principal" DECIMAL(19,4),
    "allocated_interest" DECIMAL(19,4),
    "allocated_fees" DECIMAL(19,4),
    "allocated_penalties" DECIMAL(19,4),
    "status" "RepaymentStatus" NOT NULL DEFAULT 'pending',
    "failure_reason" TEXT,
    "receipt_number" VARCHAR(50),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "repayments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "entry_type" "LedgerEntryType" NOT NULL,
    "debit_credit" "DebitCredit" NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "running_balance" DECIMAL(19,4) NOT NULL,
    "effective_date" DATE NOT NULL,
    "value_date" DATE NOT NULL,
    "description" TEXT,
    "reference_type" VARCHAR(50),
    "reference_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "actor_id" UUID,
    "actor_type" "ActorType" NOT NULL,
    "actor_ip" VARCHAR(45),
    "action" VARCHAR(100) NOT NULL,
    "resource_type" VARCHAR(100) NOT NULL,
    "resource_id" UUID,
    "before_value" JSONB,
    "after_value" JSONB,
    "correlation_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "contract_id" UUID,
    "event_type" VARCHAR(100) NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "recipient" VARCHAR(255),
    "template_id" VARCHAR(100),
    "content" TEXT,
    "status" "NotificationStatus" NOT NULL DEFAULT 'pending',
    "external_ref" VARCHAR(255),
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_schema_name_key" ON "tenants"("schema_name");

-- CreateIndex
CREATE UNIQUE INDEX "platform_users_email_key" ON "platform_users"("email");

-- CreateIndex
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- CreateIndex
CREATE INDEX "users_role_id_idx" ON "users"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_email_key" ON "users"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "roles_tenant_id_idx" ON "roles"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_tenant_id_name_key" ON "roles"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "lenders_tenant_id_idx" ON "lenders"("tenant_id");

-- CreateIndex
CREATE INDEX "customers_tenant_id_idx" ON "customers"("tenant_id");

-- CreateIndex
CREATE INDEX "customers_phone_primary_idx" ON "customers"("phone_primary");

-- CreateIndex
CREATE INDEX "customers_national_id_idx" ON "customers"("national_id");

-- CreateIndex
CREATE INDEX "customers_status_idx" ON "customers"("status");

-- CreateIndex
CREATE INDEX "customers_segment_idx" ON "customers"("segment");

-- CreateIndex
CREATE UNIQUE INDEX "customers_tenant_id_external_id_external_source_key" ON "customers"("tenant_id", "external_id", "external_source");

-- CreateIndex
CREATE INDEX "customer_consents_tenant_id_idx" ON "customer_consents"("tenant_id");

-- CreateIndex
CREATE INDEX "customer_consents_customer_id_consent_type_idx" ON "customer_consents"("customer_id", "consent_type");

-- CreateIndex
CREATE INDEX "products_tenant_id_idx" ON "products"("tenant_id");

-- CreateIndex
CREATE INDEX "products_type_idx" ON "products"("type");

-- CreateIndex
CREATE INDEX "products_status_idx" ON "products"("status");

-- CreateIndex
CREATE INDEX "products_lender_id_idx" ON "products"("lender_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenant_id_code_key" ON "products"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "product_versions_tenant_id_idx" ON "product_versions"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_versions_product_id_version_key" ON "product_versions"("product_id", "version");

-- CreateIndex
CREATE INDEX "subscriptions_tenant_id_idx" ON "subscriptions"("tenant_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_tenant_id_customer_id_product_id_key" ON "subscriptions"("tenant_id", "customer_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "loan_requests_idempotency_key_key" ON "loan_requests"("idempotency_key");

-- CreateIndex
CREATE INDEX "loan_requests_tenant_id_idx" ON "loan_requests"("tenant_id");

-- CreateIndex
CREATE INDEX "loan_requests_customer_id_idx" ON "loan_requests"("customer_id");

-- CreateIndex
CREATE INDEX "loan_requests_product_id_idx" ON "loan_requests"("product_id");

-- CreateIndex
CREATE INDEX "loan_requests_status_idx" ON "loan_requests"("status");

-- CreateIndex
CREATE INDEX "loan_requests_created_at_idx" ON "loan_requests"("created_at");

-- CreateIndex
CREATE INDEX "scoring_results_tenant_id_idx" ON "scoring_results"("tenant_id");

-- CreateIndex
CREATE INDEX "scoring_results_customer_id_idx" ON "scoring_results"("customer_id");

-- CreateIndex
CREATE INDEX "scoring_results_created_at_idx" ON "scoring_results"("created_at");

-- CreateIndex
CREATE INDEX "contracts_tenant_id_idx" ON "contracts"("tenant_id");

-- CreateIndex
CREATE INDEX "contracts_customer_id_idx" ON "contracts"("customer_id");

-- CreateIndex
CREATE INDEX "contracts_product_id_idx" ON "contracts"("product_id");

-- CreateIndex
CREATE INDEX "contracts_status_idx" ON "contracts"("status");

-- CreateIndex
CREATE INDEX "contracts_classification_idx" ON "contracts"("classification");

-- CreateIndex
CREATE INDEX "contracts_days_past_due_idx" ON "contracts"("days_past_due");

-- CreateIndex
CREATE INDEX "contracts_maturity_date_idx" ON "contracts"("maturity_date");

-- CreateIndex
CREATE INDEX "contracts_created_at_idx" ON "contracts"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_tenant_id_contract_number_key" ON "contracts"("tenant_id", "contract_number");

-- CreateIndex
CREATE INDEX "repayment_schedule_tenant_id_idx" ON "repayment_schedule"("tenant_id");

-- CreateIndex
CREATE INDEX "repayment_schedule_due_date_idx" ON "repayment_schedule"("due_date");

-- CreateIndex
CREATE INDEX "repayment_schedule_status_idx" ON "repayment_schedule"("status");

-- CreateIndex
CREATE UNIQUE INDEX "repayment_schedule_contract_id_installment_number_key" ON "repayment_schedule"("contract_id", "installment_number");

-- CreateIndex
CREATE INDEX "disbursements_tenant_id_idx" ON "disbursements"("tenant_id");

-- CreateIndex
CREATE INDEX "disbursements_contract_id_idx" ON "disbursements"("contract_id");

-- CreateIndex
CREATE INDEX "disbursements_status_idx" ON "disbursements"("status");

-- CreateIndex
CREATE INDEX "disbursements_external_ref_idx" ON "disbursements"("external_ref");

-- CreateIndex
CREATE INDEX "repayments_tenant_id_idx" ON "repayments"("tenant_id");

-- CreateIndex
CREATE INDEX "repayments_contract_id_idx" ON "repayments"("contract_id");

-- CreateIndex
CREATE INDEX "repayments_customer_id_idx" ON "repayments"("customer_id");

-- CreateIndex
CREATE INDEX "repayments_status_idx" ON "repayments"("status");

-- CreateIndex
CREATE INDEX "repayments_created_at_idx" ON "repayments"("created_at");

-- CreateIndex
CREATE INDEX "ledger_entries_tenant_id_idx" ON "ledger_entries"("tenant_id");

-- CreateIndex
CREATE INDEX "ledger_entries_contract_id_idx" ON "ledger_entries"("contract_id");

-- CreateIndex
CREATE INDEX "ledger_entries_effective_date_idx" ON "ledger_entries"("effective_date");

-- CreateIndex
CREATE INDEX "ledger_entries_entry_type_idx" ON "ledger_entries"("entry_type");

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
CREATE INDEX "notifications_tenant_id_idx" ON "notifications"("tenant_id");

-- CreateIndex
CREATE INDEX "notifications_customer_id_idx" ON "notifications"("customer_id");

-- CreateIndex
CREATE INDEX "notifications_status_idx" ON "notifications"("status");

-- CreateIndex
CREATE INDEX "notifications_event_type_idx" ON "notifications"("event_type");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_consents" ADD CONSTRAINT "customer_consents_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_lender_id_fkey" FOREIGN KEY ("lender_id") REFERENCES "lenders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_requests" ADD CONSTRAINT "loan_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_requests" ADD CONSTRAINT "loan_requests_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_requests" ADD CONSTRAINT "loan_requests_scoring_result_id_fkey" FOREIGN KEY ("scoring_result_id") REFERENCES "scoring_results"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_requests" ADD CONSTRAINT "loan_requests_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_requests" ADD CONSTRAINT "loan_requests_processed_by_fkey" FOREIGN KEY ("processed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring_results" ADD CONSTRAINT "scoring_results_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scoring_results" ADD CONSTRAINT "scoring_results_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_lender_id_fkey" FOREIGN KEY ("lender_id") REFERENCES "lenders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repayment_schedule" ADD CONSTRAINT "repayment_schedule_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disbursements" ADD CONSTRAINT "disbursements_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disbursements" ADD CONSTRAINT "disbursements_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repayments" ADD CONSTRAINT "repayments_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repayments" ADD CONSTRAINT "repayments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
