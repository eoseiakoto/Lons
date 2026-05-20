-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('provisioning', 'active', 'suspended', 'decommissioned');

-- CreateEnum
CREATE TYPE "plan_tier" AS ENUM ('starter', 'growth', 'enterprise');

-- CreateEnum
CREATE TYPE "billing_model" AS ENUM ('per_disbursement', 'revenue_share');

-- CreateEnum
CREATE TYPE "billing_invoice_type" AS ENUM ('subscription', 'usage', 'revenue_share');

-- CreateEnum
CREATE TYPE "billing_invoice_status" AS ENUM ('draft', 'issued', 'paid', 'overdue');

-- CreateEnum
CREATE TYPE "billing_line_item_type" AS ENUM ('subscription', 'disbursement_fee', 'revenue_share');

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
CREATE TYPE "CustomerStatus" AS ENUM ('active', 'suspended', 'blacklisted', 'inactive', 'anonymized');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'other', 'undisclosed');

-- CreateEnum
CREATE TYPE "KycLevel" AS ENUM ('none', 'tier_1', 'tier_2', 'tier_3');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('data_access', 'auto_deduction', 'credit_reporting', 'alternative_data', 'communications');

-- CreateEnum
CREATE TYPE "LenderStatus" AS ENUM ('active', 'suspended', 'inactive');

-- CreateEnum
CREATE TYPE "LoanRequestStatus" AS ENUM ('received', 'validated', 'pre_qualified', 'scored', 'approved', 'rejected', 'manual_review', 'escalated', 'offer_sent', 'accepted', 'declined', 'expired', 'contract_created', 'disbursing', 'disbursed', 'disbursement_failed', 'cancelled');

-- CreateEnum
CREATE TYPE "ScoringModelType" AS ENUM ('rule_based', 'ml_model', 'hybrid');

-- CreateEnum
CREATE TYPE "RiskTier" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "ScoringContext" AS ENUM ('application', 'review', 'renewal', 'monitoring');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('cooling_off', 'active', 'performing', 'due', 'overdue', 'delinquent', 'default_status', 'written_off', 'settled', 'cancelled');

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

-- CreateEnum
CREATE TYPE "WebhookAuthMethod" AS ENUM ('hmac', 'bearer', 'basic_auth');

-- CreateEnum
CREATE TYPE "WalletProviderType" AS ENUM ('MOCK', 'MTN_MOMO', 'MPESA', 'AIRTEL_MONEY', 'GENERIC');

-- CreateEnum
CREATE TYPE "screening_status" AS ENUM ('CLEAR', 'MATCH', 'POTENTIAL_MATCH', 'ERROR');

-- CreateEnum
CREATE TYPE "screening_risk_level" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "NotificationProviderType" AS ENUM ('CONSOLE', 'RECORDING_MOCK', 'AFRICAS_TALKING', 'TWILIO', 'SMTP', 'FCM');

-- CreateEnum
CREATE TYPE "AdapterEnvironmentMode" AS ENUM ('SANDBOX', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "FeedbackCategory" AS ENUM ('BUG', 'FEATURE_REQUEST', 'UX_ISSUE', 'INTEGRATION_QUESTION', 'OTHER');

-- CreateEnum
CREATE TYPE "FeedbackSeverity" AS ENUM ('CRITICAL', 'MAJOR', 'MINOR', 'SUGGESTION');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('NEW', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('calculated', 'approved', 'executing', 'settled', 'failed');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('announcement', 'direct', 'system');

-- CreateEnum
CREATE TYPE "MessagePriority" AS ENUM ('low', 'normal', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "credit_line_status" AS ENUM ('pending_activation', 'active', 'frozen', 'suspended', 'closed', 'expired');

-- CreateEnum
CREATE TYPE "drawdown_status" AS ENUM ('initiated', 'completed', 'failed', 'reversed');

-- CreateEnum
CREATE TYPE "merchant_status" AS ENUM ('pending', 'active', 'suspended', 'deactivated');

-- CreateEnum
CREATE TYPE "settlement_type" AS ENUM ('IMMEDIATE', 'T_PLUS_1');

-- CreateEnum
CREATE TYPE "bnpl_transaction_status" AS ENUM ('initiated', 'approved', 'active', 'completed', 'cancelled', 'accelerated', 'defaulted', 'refunded');

-- CreateEnum
CREATE TYPE "installment_status" AS ENUM ('pending', 'due', 'paid', 'overdue', 'waived');

-- CreateEnum
CREATE TYPE "merchant_settlement_status" AS ENUM ('pending', 'processing', 'settled', 'failed');

-- CreateEnum
CREATE TYPE "bnpl_credit_line_status" AS ENUM ('active', 'suspended', 'closed', 'expired');

-- CreateEnum
CREATE TYPE "debtor_status" AS ENUM ('active', 'under_review', 'suspended', 'blacklisted');

-- CreateEnum
CREATE TYPE "invoice_status" AS ENUM ('submitted', 'under_review', 'verified', 'offer_generated', 'offer_accepted', 'funded', 'debtor_notified', 'payment_received', 'reserve_released', 'settled', 'disputed', 'defaulted', 'cancelled', 'rejected');

-- CreateEnum
CREATE TYPE "verification_status" AS ENUM ('pending', 'verified', 'failed', 'waived');

-- CreateEnum
CREATE TYPE "recourse_type" AS ENUM ('with_recourse', 'without_recourse');

-- CreateEnum
CREATE TYPE "revenue_distribution_model" AS ENUM ('percentage_split', 'tiered', 'fixed_fee', 'waterfall');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(63) NOT NULL,
    "legal_name" VARCHAR(255),
    "registration_number" VARCHAR(100),
    "country" VARCHAR(3) NOT NULL,
    "schema_name" VARCHAR(63) NOT NULL,
    "plan_tier" "plan_tier" NOT NULL DEFAULT 'starter',
    "status" "TenantStatus" NOT NULL DEFAULT 'provisioning',
    "platform_fee_percent" DECIMAL(5,2),
    "settings" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_tier_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tier" "plan_tier" NOT NULL,
    "display_name" VARCHAR(50) NOT NULL,
    "allowed_product_types" JSONB NOT NULL,
    "max_active_products" INTEGER,
    "max_customers" INTEGER,
    "max_monthly_disbursement_volume_usd" DECIMAL(19,4),
    "max_monthly_transactions" INTEGER,
    "max_lender_configs" INTEGER,
    "max_bnpl_merchants" INTEGER,
    "max_portal_users" INTEGER,
    "data_retention_months" INTEGER NOT NULL DEFAULT 12,
    "feature_flags" JSONB NOT NULL,
    "api_rate_limit_per_minute" INTEGER NOT NULL DEFAULT 60,
    "rest_api_enabled" BOOLEAN NOT NULL DEFAULT false,
    "websocket_enabled" BOOLEAN NOT NULL DEFAULT false,
    "bulk_operations_enabled" BOOLEAN NOT NULL DEFAULT false,
    "max_api_keys" INTEGER,
    "branding_options" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "plan_tier_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_billing_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "plan_tier" "plan_tier" NOT NULL,
    "subscription_amount_usd" DECIMAL(19,4) NOT NULL,
    "billing_model" "billing_model" NOT NULL DEFAULT 'per_disbursement',
    "per_disbursement_bps" DECIMAL(7,2),
    "revenue_share_pct" DECIMAL(5,4),
    "micro_loan_rate_modifier" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "overdraft_rate_modifier" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "bnpl_rate_modifier" DECIMAL(7,2) NOT NULL DEFAULT -10,
    "factoring_rate_modifier" DECIMAL(7,2) NOT NULL DEFAULT -20,
    "volume_discount_tiers" JSONB NOT NULL DEFAULT '[]',
    "billing_currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "payment_terms_days" INTEGER NOT NULL DEFAULT 15,
    "contract_start_date" DATE NOT NULL,
    "contract_end_date" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenant_billing_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "email_hash" VARCHAR(64),
    "password_hash" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255),
    "role" "PlatformUserRole" NOT NULL,
    "mfa_secret" VARCHAR(255),
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mfa_backup_codes" TEXT,
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
    "email_hash" VARCHAR(64),
    "password_hash" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255),
    "phone" VARCHAR(20),
    "role_id" UUID NOT NULL,
    "mfa_secret" VARCHAR(255),
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mfa_backup_codes" TEXT,
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
    "national_id_hash" VARCHAR(64),
    "national_id_type" VARCHAR(50),
    "phone_primary" VARCHAR(50),
    "phone_primary_hash" VARCHAR(64),
    "phone_secondary" VARCHAR(50),
    "email" VARCHAR(255),
    "email_hash" VARCHAR(64),
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
    "anonymized_at" TIMESTAMPTZ(6),
    "anonymized_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_account_mappings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "wallet_id" VARCHAR(255) NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "wallet_account_mappings_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "screening_results" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "external_id" VARCHAR(255),
    "provider" VARCHAR(50) NOT NULL,
    "status" "screening_status" NOT NULL DEFAULT 'CLEAR',
    "risk_level" "screening_risk_level" NOT NULL DEFAULT 'LOW',
    "match_count" INTEGER NOT NULL DEFAULT 0,
    "match_details" JSONB,
    "raw_response" BYTEA,
    "screened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "review_decision" VARCHAR(50),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "screening_results_pkey" PRIMARY KEY ("id")
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
    "overdraft_config" JSONB,
    "bnpl_config" JSONB,
    "factoring_config" JSONB,
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
    "last_deduction_attempt_at" TIMESTAMPTZ(6),
    "deduction_attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_deduction_retry_at" TIMESTAMPTZ(6),
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
    "idempotency_key" VARCHAR(255),
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
    "previous_hash" CHAR(64),
    "entry_hash" CHAR(64),
    "access_type" VARCHAR(30),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id","created_at")
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "survey_responses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_responses_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "key_hash" CHAR(64) NOT NULL,
    "secret_hash" VARCHAR(64) NOT NULL DEFAULT '',
    "rate_limit_per_minute" INTEGER NOT NULL DEFAULT 60,
    "expires_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "last_used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "lender_id" UUID NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "approved_limit" DECIMAL(19,4) NOT NULL,
    "available_balance" DECIMAL(19,4) NOT NULL,
    "outstanding_amount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "interest_rate" DECIMAL(7,4) NOT NULL,
    "interest_accrued" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "fees_outstanding" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "penalties_accrued" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "status" "credit_line_status" NOT NULL DEFAULT 'pending_activation',
    "billing_cycle_day" INTEGER NOT NULL DEFAULT 1,
    "current_cycle_start" DATE,
    "current_cycle_end" DATE,
    "due_date" DATE,
    "days_past_due" INTEGER NOT NULL DEFAULT 0,
    "aging_bucket" VARCHAR(20),
    "aging_updated_at" TIMESTAMPTZ(6),
    "last_drawdown_at" TIMESTAMPTZ(6),
    "last_repayment_at" TIMESTAMPTZ(6),
    "last_limit_review_at" TIMESTAMPTZ(6),
    "activated_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "frozen_at" TIMESTAMPTZ(6),
    "frozen_reason" TEXT,
    "closed_at" TIMESTAMPTZ(6),
    "closed_reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "credit_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_cycle_histories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "credit_line_id" UUID NOT NULL,
    "cycle_number" INTEGER NOT NULL,
    "cycle_start" DATE NOT NULL,
    "cycle_end" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "opening_balance" DECIMAL(19,4) NOT NULL,
    "closing_balance" DECIMAL(19,4) NOT NULL,
    "interest_charged" DECIMAL(19,4) NOT NULL,
    "fees_charged" DECIMAL(19,4) NOT NULL,
    "penalties_charged" DECIMAL(19,4) NOT NULL,
    "total_repayments" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "paid_in_full" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_cycle_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drawdowns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "credit_line_id" UUID NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "wallet_balance" DECIMAL(19,4) NOT NULL,
    "transaction_ref" VARCHAR(255) NOT NULL,
    "wallet_ref" VARCHAR(255),
    "fee_amount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "status" "drawdown_status" NOT NULL DEFAULT 'initiated',
    "failure_reason" TEXT,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "drawdowns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_limit_changes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "credit_line_id" UUID NOT NULL,
    "previous_limit" DECIMAL(19,4) NOT NULL,
    "new_limit" DECIMAL(19,4) NOT NULL,
    "reason_code" VARCHAR(50) NOT NULL,
    "reason_detail" TEXT,
    "triggered_by" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_limit_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "micro_loan_credit_limit_changes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "previous_limit" DECIMAL(19,4) NOT NULL,
    "new_limit" DECIMAL(19,4) NOT NULL,
    "change_type" VARCHAR(20) NOT NULL,
    "reason" TEXT NOT NULL,
    "triggered_by" VARCHAR(80) NOT NULL,
    "source_id" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "micro_loan_credit_limit_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aging_bucket_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "product_id" UUID,
    "bucket_name" VARCHAR(50) NOT NULL,
    "days_min" INTEGER NOT NULL,
    "days_max" INTEGER NOT NULL,
    "contract_status" VARCHAR(30) NOT NULL,
    "classification" VARCHAR(30) NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "actions" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "aging_bucket_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "status" "merchant_status" NOT NULL DEFAULT 'pending',
    "contact_email" VARCHAR(255),
    "contact_phone" VARCHAR(50),
    "settlement_type" "settlement_type" NOT NULL DEFAULT 'T_PLUS_1',
    "discount_rate" DECIMAL(7,4) NOT NULL,
    "wallet_id" VARCHAR(255),
    "wallet_provider" VARCHAR(50),
    "metadata" JSONB,
    "onboarded_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bnpl_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "lender_id" UUID NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "purchase_amount" DECIMAL(19,4) NOT NULL,
    "total_repayable" DECIMAL(19,4) NOT NULL,
    "number_of_installments" INTEGER NOT NULL,
    "status" "bnpl_transaction_status" NOT NULL DEFAULT 'initiated',
    "purchase_ref" VARCHAR(255) NOT NULL,
    "merchant_ref" VARCHAR(255),
    "interest_rate" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "accelerated_at" TIMESTAMPTZ(6),
    "idempotency_key" VARCHAR(255),
    "metadata" JSONB,
    "settlement_id" UUID,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bnpl_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installment_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "installment_number" INTEGER NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "principal_portion" DECIMAL(19,4) NOT NULL,
    "interest_portion" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "fee_portion" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "due_date" DATE NOT NULL,
    "status" "installment_status" NOT NULL DEFAULT 'pending',
    "paid_amount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "paid_at" TIMESTAMPTZ(6),
    "days_past_due" INTEGER NOT NULL DEFAULT 0,
    "last_collection_attempt_at" TIMESTAMPTZ(6),
    "collection_attempt_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "installment_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_settlements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "gross_amount" DECIMAL(19,4) NOT NULL,
    "discount_fee" DECIMAL(19,4) NOT NULL,
    "net_amount" DECIMAL(19,4) NOT NULL,
    "transaction_count" INTEGER NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "status" "merchant_settlement_status" NOT NULL DEFAULT 'pending',
    "settled_at" TIMESTAMPTZ(6),
    "wallet_ref" VARCHAR(255),
    "failure_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "merchant_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bnpl_credit_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "approved_limit" DECIMAL(19,4) NOT NULL,
    "available_limit" DECIMAL(19,4) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "status" "bnpl_credit_line_status" NOT NULL DEFAULT 'active',
    "activated_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "last_reviewed_at" TIMESTAMPTZ(6),
    "next_review_at" TIMESTAMPTZ(6),
    "suspended_at" TIMESTAMPTZ(6),
    "suspended_reason" TEXT,
    "closed_at" TIMESTAMPTZ(6),
    "closed_reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "bnpl_credit_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bnpl_credit_line_adjustments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "credit_line_id" UUID NOT NULL,
    "previous_limit" DECIMAL(19,4) NOT NULL,
    "new_limit" DECIMAL(19,4) NOT NULL,
    "adjustment_type" VARCHAR(50) NOT NULL,
    "reason_code" VARCHAR(50) NOT NULL,
    "reason_detail" TEXT,
    "triggered_by" VARCHAR(80) NOT NULL,
    "idempotency_key" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bnpl_credit_line_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debtors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "company_name" VARCHAR(255) NOT NULL,
    "trading_name" VARCHAR(255),
    "registration_number" VARCHAR(100),
    "registration_number_hash" VARCHAR(64),
    "tax_id" VARCHAR(100),
    "tax_id_hash" VARCHAR(64),
    "country" VARCHAR(3) NOT NULL,
    "industry_sector" VARCHAR(100),
    "contact_email" VARCHAR(255),
    "contact_phone" VARCHAR(50),
    "contact_name" VARCHAR(255),
    "address" JSONB,
    "payment_terms" VARCHAR(50),
    "average_payment_days" INTEGER,
    "external_credit_rating" VARCHAR(50),
    "internal_risk_score" DECIMAL(5,2),
    "total_exposure" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "exposure_limit" DECIMAL(19,4),
    "status" "debtor_status" NOT NULL DEFAULT 'active',
    "verified_at" TIMESTAMPTZ(6),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "debtors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "seller_id" UUID NOT NULL,
    "debtor_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "contract_id" UUID,
    "idempotency_key" VARCHAR(255) NOT NULL,
    "invoice_number" VARCHAR(100) NOT NULL,
    "issue_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "face_value" DECIMAL(19,4) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "advance_rate_percent" DECIMAL(5,2) NOT NULL,
    "advanced_amount" DECIMAL(19,4),
    "reserve_amount" DECIMAL(19,4),
    "discount_fee" DECIMAL(19,4),
    "service_fee" DECIMAL(19,4),
    "net_disbursement" DECIMAL(19,4),
    "status" "invoice_status" NOT NULL DEFAULT 'submitted',
    "verification_status" "verification_status" NOT NULL DEFAULT 'pending',
    "verified_by" UUID,
    "verified_at" TIMESTAMPTZ(6),
    "verification_notes" TEXT,
    "assigned_verifier_id" UUID,
    "recourse_type" "recourse_type" NOT NULL DEFAULT 'with_recourse',
    "offer_expires_at" TIMESTAMPTZ(6),
    "debtor_notified_at" TIMESTAMPTZ(6),
    "debtor_payment_ref" VARCHAR(255),
    "debtor_paid_at" TIMESTAMPTZ(6),
    "amount_received" DECIMAL(19,4) DEFAULT 0,
    "reserve_released" DECIMAL(19,4) DEFAULT 0,
    "dispute_reason" TEXT,
    "documents" JSONB,
    "metadata" JSONB,
    "funded_at" TIMESTAMPTZ(6),
    "settled_at" TIMESTAMPTZ(6),
    "defaulted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "invoice_number" VARCHAR(30) NOT NULL,
    "type" "billing_invoice_type" NOT NULL,
    "billing_period_start" DATE NOT NULL,
    "billing_period_end" DATE NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "subtotal" DECIMAL(19,4) NOT NULL,
    "tax_amount" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(19,4) NOT NULL,
    "status" "billing_invoice_status" NOT NULL DEFAULT 'draft',
    "issued_at" TIMESTAMPTZ(6),
    "due_date" DATE,
    "paid_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "billing_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_line_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "billing_invoice_id" UUID NOT NULL,
    "type" "billing_line_item_type" NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price" DECIMAL(19,4) NOT NULL,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disbursement_fees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "disbursement_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "product_type" VARCHAR(30) NOT NULL,
    "gross_amount" DECIMAL(19,4) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "base_bps" DECIMAL(7,2) NOT NULL,
    "product_modifier_bps" DECIMAL(7,2) NOT NULL,
    "effective_bps" DECIMAL(7,2) NOT NULL,
    "volume_discount_multiplier" DECIMAL(7,4) NOT NULL,
    "fee_rate" DECIMAL(7,2) NOT NULL,
    "fee_amount" DECIMAL(19,4) NOT NULL,
    "fee_amount_usd" DECIMAL(19,4) NOT NULL,
    "exchange_rate" DECIMAL(12,6),
    "volume_tier" VARCHAR(50),
    "billing_invoice_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disbursement_fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_financial_data" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "source" VARCHAR(50) NOT NULL,
    "source_provider" VARCHAR(100),
    "wallet_id" VARCHAR(255),
    "current_balance" DECIMAL(19,4),
    "average_balance_30d" DECIMAL(19,4),
    "average_balance_90d" DECIMAL(19,4),
    "transaction_count_30d" INTEGER,
    "transaction_count_90d" INTEGER,
    "income_consistency" INTEGER,
    "income_expense_ratio" DECIMAL(7,4),
    "currency" VARCHAR(3) NOT NULL,
    "raw_data" JSONB,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customer_financial_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emi_integration_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "provider" VARCHAR(100) NOT NULL,
    "credentials" TEXT,
    "base_url" VARCHAR(500),
    "field_mappings" JSONB,
    "sync_frequency_min" INTEGER NOT NULL DEFAULT 360,
    "retry_policy" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_sync_at" TIMESTAMPTZ(6),
    "last_sync_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "emi_integration_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scorecard_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "product_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "version" VARCHAR(50) NOT NULL,
    "config" JSONB NOT NULL,
    "score_range_min" DECIMAL(7,2) NOT NULL DEFAULT 0,
    "score_range_max" DECIMAL(7,2) NOT NULL DEFAULT 1000,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "scorecard_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_matching_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "match_fields" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "customer_matching_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operator_approval_limits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "max_approval_amount" DECIMAL(19,4) NOT NULL,
    "max_approvals_per_day" INTEGER,
    "allowed_product_types" JSONB,
    "can_approve_escalated" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "operator_approval_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_step_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "loan_request_id" UUID NOT NULL,
    "step_name" VARCHAR(100) NOT NULL,
    "step_order" INTEGER NOT NULL,
    "outcome" VARCHAR(50) NOT NULL,
    "inputs" JSONB,
    "outputs" JSONB,
    "error_message" TEXT,
    "error_code" VARCHAR(100),
    "duration_ms" INTEGER NOT NULL,
    "triggered_by" UUID,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pipeline_step_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revenue_distribution_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "product_id" UUID,
    "model" "revenue_distribution_model" NOT NULL,
    "config" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "revenue_distribution_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upgrade_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "current_tier" "plan_tier" NOT NULL,
    "requested_tier" "plan_tier" NOT NULL,
    "reason" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "requested_by" UUID,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "review_notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "upgrade_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_schema_name_key" ON "tenants"("schema_name");

-- CreateIndex
CREATE UNIQUE INDEX "plan_tier_configs_tier_key" ON "plan_tier_configs"("tier");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_billing_configs_tenant_id_key" ON "tenant_billing_configs"("tenant_id");

-- CreateIndex
CREATE INDEX "tenant_billing_configs_tenant_id_idx" ON "tenant_billing_configs"("tenant_id");

-- CreateIndex
CREATE INDEX "tenant_billing_configs_plan_tier_idx" ON "tenant_billing_configs"("plan_tier");

-- CreateIndex
CREATE UNIQUE INDEX "platform_users_email_hash_key" ON "platform_users"("email_hash");

-- CreateIndex
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- CreateIndex
CREATE INDEX "users_role_id_idx" ON "users"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_email_hash_key" ON "users"("tenant_id", "email_hash");

-- CreateIndex
CREATE INDEX "roles_tenant_id_idx" ON "roles"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_tenant_id_name_key" ON "roles"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "lenders_tenant_id_idx" ON "lenders"("tenant_id");

-- CreateIndex
CREATE INDEX "customers_tenant_id_idx" ON "customers"("tenant_id");

-- CreateIndex
CREATE INDEX "customers_tenant_id_phone_primary_hash_idx" ON "customers"("tenant_id", "phone_primary_hash");

-- CreateIndex
CREATE INDEX "customers_tenant_id_national_id_hash_idx" ON "customers"("tenant_id", "national_id_hash");

-- CreateIndex
CREATE INDEX "customers_tenant_id_email_hash_idx" ON "customers"("tenant_id", "email_hash");

-- CreateIndex
CREATE INDEX "customers_status_idx" ON "customers"("status");

-- CreateIndex
CREATE INDEX "customers_segment_idx" ON "customers"("segment");

-- CreateIndex
CREATE UNIQUE INDEX "customers_tenant_id_external_id_external_source_key" ON "customers"("tenant_id", "external_id", "external_source");

-- CreateIndex
CREATE INDEX "wallet_account_mappings_tenant_id_idx" ON "wallet_account_mappings"("tenant_id");

-- CreateIndex
CREATE INDEX "wallet_account_mappings_customer_id_idx" ON "wallet_account_mappings"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_account_mappings_provider_wallet_id_key" ON "wallet_account_mappings"("provider", "wallet_id");

-- CreateIndex
CREATE INDEX "customer_consents_tenant_id_idx" ON "customer_consents"("tenant_id");

-- CreateIndex
CREATE INDEX "customer_consents_customer_id_consent_type_idx" ON "customer_consents"("customer_id", "consent_type");

-- CreateIndex
CREATE INDEX "screening_results_tenant_id_idx" ON "screening_results"("tenant_id");

-- CreateIndex
CREATE INDEX "screening_results_customer_id_idx" ON "screening_results"("customer_id");

-- CreateIndex
CREATE INDEX "screening_results_status_idx" ON "screening_results"("status");

-- CreateIndex
CREATE INDEX "screening_results_expires_at_idx" ON "screening_results"("expires_at");

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
CREATE INDEX "repayment_schedule_next_deduction_retry_at_idx" ON "repayment_schedule"("next_deduction_retry_at");

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
CREATE UNIQUE INDEX "repayments_tenant_id_idempotency_key_key" ON "repayments"("tenant_id", "idempotency_key");

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
CREATE INDEX "audit_logs_entry_hash_idx" ON "audit_logs"("entry_hash");

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
CREATE INDEX "webhook_endpoints_tenant_id_idx" ON "webhook_endpoints"("tenant_id");

-- CreateIndex
CREATE INDEX "webhook_endpoints_tenant_id_active_idx" ON "webhook_endpoints"("tenant_id", "active");

-- CreateIndex
CREATE INDEX "webhook_delivery_logs_webhook_endpoint_id_idx" ON "webhook_delivery_logs"("webhook_endpoint_id");

-- CreateIndex
CREATE INDEX "webhook_delivery_logs_status_idx" ON "webhook_delivery_logs"("status");

-- CreateIndex
CREATE INDEX "webhook_delivery_logs_webhook_endpoint_id_status_created_at_idx" ON "webhook_delivery_logs"("webhook_endpoint_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "wallet_provider_configs_tenant_id_idx" ON "wallet_provider_configs"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_provider_configs_tenant_id_provider_type_is_active_key" ON "wallet_provider_configs"("tenant_id", "provider_type", "is_active");

-- CreateIndex
CREATE INDEX "notification_provider_configs_tenant_id_idx" ON "notification_provider_configs"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_provider_configs_tenant_id_provider_type_is_ac_key" ON "notification_provider_configs"("tenant_id", "provider_type", "is_active");

-- CreateIndex
CREATE INDEX "notification_mock_log_tenant_id_idx" ON "notification_mock_log"("tenant_id");

-- CreateIndex
CREATE INDEX "notification_mock_log_correlation_id_idx" ON "notification_mock_log"("correlation_id");

-- CreateIndex
CREATE INDEX "feedbacks_tenant_id_idx" ON "feedbacks"("tenant_id");

-- CreateIndex
CREATE INDEX "feedbacks_status_idx" ON "feedbacks"("status");

-- CreateIndex
CREATE INDEX "survey_responses_tenant_id_idx" ON "survey_responses"("tenant_id");

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
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "api_keys_tenant_id_idx" ON "api_keys"("tenant_id");

-- CreateIndex
CREATE INDEX "api_keys_revoked_at_idx" ON "api_keys"("revoked_at");

-- CreateIndex
CREATE INDEX "api_keys_expires_at_idx" ON "api_keys"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "api_keys"("key_hash");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_tenant_id_name_key" ON "api_keys"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "credit_lines_tenant_id_idx" ON "credit_lines"("tenant_id");

-- CreateIndex
CREATE INDEX "credit_lines_customer_id_idx" ON "credit_lines"("customer_id");

-- CreateIndex
CREATE INDEX "credit_lines_status_idx" ON "credit_lines"("status");

-- CreateIndex
CREATE INDEX "credit_lines_expires_at_idx" ON "credit_lines"("expires_at");

-- CreateIndex
CREATE INDEX "credit_lines_due_date_idx" ON "credit_lines"("due_date");

-- CreateIndex
CREATE INDEX "credit_lines_aging_bucket_idx" ON "credit_lines"("aging_bucket");

-- CreateIndex
CREATE UNIQUE INDEX "credit_lines_tenant_id_customer_id_product_id_key" ON "credit_lines"("tenant_id", "customer_id", "product_id");

-- CreateIndex
CREATE INDEX "billing_cycle_histories_tenant_id_idx" ON "billing_cycle_histories"("tenant_id");

-- CreateIndex
CREATE INDEX "billing_cycle_histories_credit_line_id_idx" ON "billing_cycle_histories"("credit_line_id");

-- CreateIndex
CREATE INDEX "billing_cycle_histories_due_date_idx" ON "billing_cycle_histories"("due_date");

-- CreateIndex
CREATE UNIQUE INDEX "billing_cycle_histories_credit_line_id_cycle_number_key" ON "billing_cycle_histories"("credit_line_id", "cycle_number");

-- CreateIndex
CREATE INDEX "drawdowns_tenant_id_idx" ON "drawdowns"("tenant_id");

-- CreateIndex
CREATE INDEX "drawdowns_credit_line_id_idx" ON "drawdowns"("credit_line_id");

-- CreateIndex
CREATE INDEX "drawdowns_transaction_ref_idx" ON "drawdowns"("transaction_ref");

-- CreateIndex
CREATE INDEX "drawdowns_status_idx" ON "drawdowns"("status");

-- CreateIndex
CREATE INDEX "credit_limit_changes_tenant_id_idx" ON "credit_limit_changes"("tenant_id");

-- CreateIndex
CREATE INDEX "credit_limit_changes_credit_line_id_idx" ON "credit_limit_changes"("credit_line_id");

-- CreateIndex
CREATE INDEX "micro_loan_credit_limit_changes_tenant_id_idx" ON "micro_loan_credit_limit_changes"("tenant_id");

-- CreateIndex
CREATE INDEX "micro_loan_credit_limit_changes_customer_id_idx" ON "micro_loan_credit_limit_changes"("customer_id");

-- CreateIndex
CREATE INDEX "micro_loan_credit_limit_changes_subscription_id_idx" ON "micro_loan_credit_limit_changes"("subscription_id");

-- CreateIndex
CREATE INDEX "micro_loan_credit_limit_changes_change_type_idx" ON "micro_loan_credit_limit_changes"("change_type");

-- CreateIndex
CREATE INDEX "micro_loan_credit_limit_changes_created_at_idx" ON "micro_loan_credit_limit_changes"("created_at");

-- CreateIndex
CREATE INDEX "micro_loan_credit_limit_changes_tenant_id_source_id_idx" ON "micro_loan_credit_limit_changes"("tenant_id", "source_id");

-- CreateIndex
CREATE INDEX "aging_bucket_configs_tenant_id_idx" ON "aging_bucket_configs"("tenant_id");

-- CreateIndex
CREATE INDEX "aging_bucket_configs_product_id_idx" ON "aging_bucket_configs"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "aging_bucket_configs_tenant_id_product_id_bucket_name_key" ON "aging_bucket_configs"("tenant_id", "product_id", "bucket_name");

-- CreateIndex
CREATE INDEX "merchants_tenant_id_idx" ON "merchants"("tenant_id");

-- CreateIndex
CREATE INDEX "merchants_status_idx" ON "merchants"("status");

-- CreateIndex
CREATE UNIQUE INDEX "merchants_tenant_id_code_key" ON "merchants"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "bnpl_transactions_tenant_id_idx" ON "bnpl_transactions"("tenant_id");

-- CreateIndex
CREATE INDEX "bnpl_transactions_customer_id_idx" ON "bnpl_transactions"("customer_id");

-- CreateIndex
CREATE INDEX "bnpl_transactions_merchant_id_idx" ON "bnpl_transactions"("merchant_id");

-- CreateIndex
CREATE INDEX "bnpl_transactions_lender_id_idx" ON "bnpl_transactions"("lender_id");

-- CreateIndex
CREATE INDEX "bnpl_transactions_status_idx" ON "bnpl_transactions"("status");

-- CreateIndex
CREATE INDEX "bnpl_transactions_purchase_ref_idx" ON "bnpl_transactions"("purchase_ref");

-- CreateIndex
CREATE INDEX "bnpl_transactions_settlement_id_idx" ON "bnpl_transactions"("settlement_id");

-- CreateIndex
CREATE UNIQUE INDEX "bnpl_transactions_tenant_id_merchant_id_purchase_ref_key" ON "bnpl_transactions"("tenant_id", "merchant_id", "purchase_ref");

-- CreateIndex
CREATE UNIQUE INDEX "bnpl_transactions_tenant_id_idempotency_key_key" ON "bnpl_transactions"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "installment_schedules_tenant_id_idx" ON "installment_schedules"("tenant_id");

-- CreateIndex
CREATE INDEX "installment_schedules_transaction_id_idx" ON "installment_schedules"("transaction_id");

-- CreateIndex
CREATE INDEX "installment_schedules_due_date_idx" ON "installment_schedules"("due_date");

-- CreateIndex
CREATE INDEX "installment_schedules_status_idx" ON "installment_schedules"("status");

-- CreateIndex
CREATE UNIQUE INDEX "installment_schedules_transaction_id_installment_number_key" ON "installment_schedules"("transaction_id", "installment_number");

-- CreateIndex
CREATE INDEX "merchant_settlements_tenant_id_idx" ON "merchant_settlements"("tenant_id");

-- CreateIndex
CREATE INDEX "merchant_settlements_merchant_id_idx" ON "merchant_settlements"("merchant_id");

-- CreateIndex
CREATE INDEX "merchant_settlements_status_idx" ON "merchant_settlements"("status");

-- CreateIndex
CREATE INDEX "merchant_settlements_period_end_idx" ON "merchant_settlements"("period_end");

-- CreateIndex
CREATE UNIQUE INDEX "bnpl_credit_lines_subscription_id_key" ON "bnpl_credit_lines"("subscription_id");

-- CreateIndex
CREATE INDEX "bnpl_credit_lines_tenant_id_idx" ON "bnpl_credit_lines"("tenant_id");

-- CreateIndex
CREATE INDEX "bnpl_credit_lines_customer_id_idx" ON "bnpl_credit_lines"("customer_id");

-- CreateIndex
CREATE INDEX "bnpl_credit_lines_subscription_id_idx" ON "bnpl_credit_lines"("subscription_id");

-- CreateIndex
CREATE INDEX "bnpl_credit_lines_product_id_idx" ON "bnpl_credit_lines"("product_id");

-- CreateIndex
CREATE INDEX "bnpl_credit_lines_status_idx" ON "bnpl_credit_lines"("status");

-- CreateIndex
CREATE INDEX "bnpl_credit_lines_next_review_at_idx" ON "bnpl_credit_lines"("next_review_at");

-- CreateIndex
CREATE INDEX "bnpl_credit_lines_expires_at_idx" ON "bnpl_credit_lines"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "bnpl_credit_lines_tenant_id_customer_id_subscription_id_key" ON "bnpl_credit_lines"("tenant_id", "customer_id", "subscription_id");

-- CreateIndex
CREATE INDEX "bnpl_credit_line_adjustments_tenant_id_idx" ON "bnpl_credit_line_adjustments"("tenant_id");

-- CreateIndex
CREATE INDEX "bnpl_credit_line_adjustments_credit_line_id_idx" ON "bnpl_credit_line_adjustments"("credit_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "bnpl_credit_line_adjustments_tenant_id_idempotency_key_key" ON "bnpl_credit_line_adjustments"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "debtors_tenant_id_idx" ON "debtors"("tenant_id");

-- CreateIndex
CREATE INDEX "debtors_status_idx" ON "debtors"("status");

-- CreateIndex
CREATE INDEX "debtors_industry_sector_idx" ON "debtors"("industry_sector");

-- CreateIndex
CREATE INDEX "debtors_tenant_id_tax_id_hash_idx" ON "debtors"("tenant_id", "tax_id_hash");

-- CreateIndex
CREATE UNIQUE INDEX "debtors_tenant_id_company_name_registration_number_hash_key" ON "debtors"("tenant_id", "company_name", "registration_number_hash");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_contract_id_key" ON "invoices"("contract_id");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_idx" ON "invoices"("tenant_id");

-- CreateIndex
CREATE INDEX "invoices_seller_id_idx" ON "invoices"("seller_id");

-- CreateIndex
CREATE INDEX "invoices_debtor_id_idx" ON "invoices"("debtor_id");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoices_due_date_idx" ON "invoices"("due_date");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenant_id_idempotency_key_key" ON "invoices"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenant_id_seller_id_invoice_number_key" ON "invoices"("tenant_id", "seller_id", "invoice_number");

-- CreateIndex
CREATE INDEX "billing_invoices_tenant_id_idx" ON "billing_invoices"("tenant_id");

-- CreateIndex
CREATE INDEX "billing_invoices_status_idx" ON "billing_invoices"("status");

-- CreateIndex
CREATE INDEX "billing_invoices_type_idx" ON "billing_invoices"("type");

-- CreateIndex
CREATE INDEX "billing_invoices_billing_period_start_idx" ON "billing_invoices"("billing_period_start");

-- CreateIndex
CREATE INDEX "billing_invoices_tenant_id_type_billing_period_start_idx" ON "billing_invoices"("tenant_id", "type", "billing_period_start");

-- CreateIndex
CREATE UNIQUE INDEX "billing_invoices_tenant_id_invoice_number_key" ON "billing_invoices"("tenant_id", "invoice_number");

-- CreateIndex
CREATE INDEX "billing_line_items_billing_invoice_id_idx" ON "billing_line_items"("billing_invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "disbursement_fees_disbursement_id_key" ON "disbursement_fees"("disbursement_id");

-- CreateIndex
CREATE INDEX "disbursement_fees_tenant_id_idx" ON "disbursement_fees"("tenant_id");

-- CreateIndex
CREATE INDEX "disbursement_fees_tenant_id_created_at_idx" ON "disbursement_fees"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "disbursement_fees_billing_invoice_id_idx" ON "disbursement_fees"("billing_invoice_id");

-- CreateIndex
CREATE INDEX "disbursement_fees_tenant_id_product_type_idx" ON "disbursement_fees"("tenant_id", "product_type");

-- CreateIndex
CREATE UNIQUE INDEX "disbursement_fees_tenant_id_disbursement_id_key" ON "disbursement_fees"("tenant_id", "disbursement_id");

-- CreateIndex
CREATE INDEX "customer_financial_data_tenant_id_idx" ON "customer_financial_data"("tenant_id");

-- CreateIndex
CREATE INDEX "customer_financial_data_customer_id_idx" ON "customer_financial_data"("customer_id");

-- CreateIndex
CREATE INDEX "customer_financial_data_customer_id_source_fetched_at_idx" ON "customer_financial_data"("customer_id", "source", "fetched_at");

-- CreateIndex
CREATE INDEX "emi_integration_configs_tenant_id_idx" ON "emi_integration_configs"("tenant_id");

-- CreateIndex
CREATE INDEX "emi_integration_configs_is_active_idx" ON "emi_integration_configs"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "emi_integration_configs_tenant_id_name_key" ON "emi_integration_configs"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "scorecard_configs_tenant_id_idx" ON "scorecard_configs"("tenant_id");

-- CreateIndex
CREATE INDEX "scorecard_configs_product_id_idx" ON "scorecard_configs"("product_id");

-- CreateIndex
CREATE INDEX "scorecard_configs_is_active_idx" ON "scorecard_configs"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "scorecard_configs_tenant_id_product_id_version_key" ON "scorecard_configs"("tenant_id", "product_id", "version");

-- CreateIndex
CREATE INDEX "customer_matching_rules_tenant_id_idx" ON "customer_matching_rules"("tenant_id");

-- CreateIndex
CREATE INDEX "customer_matching_rules_tenant_id_is_active_priority_idx" ON "customer_matching_rules"("tenant_id", "is_active", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "operator_approval_limits_user_id_key" ON "operator_approval_limits"("user_id");

-- CreateIndex
CREATE INDEX "operator_approval_limits_tenant_id_idx" ON "operator_approval_limits"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "operator_approval_limits_tenant_id_user_id_key" ON "operator_approval_limits"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "pipeline_step_logs_tenant_id_idx" ON "pipeline_step_logs"("tenant_id");

-- CreateIndex
CREATE INDEX "pipeline_step_logs_loan_request_id_idx" ON "pipeline_step_logs"("loan_request_id");

-- CreateIndex
CREATE INDEX "pipeline_step_logs_loan_request_id_step_order_idx" ON "pipeline_step_logs"("loan_request_id", "step_order");

-- CreateIndex
CREATE INDEX "revenue_distribution_configs_tenant_id_idx" ON "revenue_distribution_configs"("tenant_id");

-- CreateIndex
CREATE INDEX "revenue_distribution_configs_tenant_id_product_id_idx" ON "revenue_distribution_configs"("tenant_id", "product_id");

-- CreateIndex
CREATE INDEX "upgrade_requests_tenant_id_idx" ON "upgrade_requests"("tenant_id");

-- CreateIndex
CREATE INDEX "upgrade_requests_status_idx" ON "upgrade_requests"("status");

-- AddForeignKey
ALTER TABLE "tenant_billing_configs" ADD CONSTRAINT "tenant_billing_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_account_mappings" ADD CONSTRAINT "wallet_account_mappings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_consents" ADD CONSTRAINT "customer_consents_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screening_results" ADD CONSTRAINT "screening_results_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE "settlement_lines" ADD CONSTRAINT "settlement_lines_settlement_run_id_fkey" FOREIGN KEY ("settlement_run_id") REFERENCES "settlement_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_exceptions" ADD CONSTRAINT "reconciliation_exceptions_reconciliation_run_id_fkey" FOREIGN KEY ("reconciliation_run_id") REFERENCES "reconciliation_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections_actions" ADD CONSTRAINT "collections_actions_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_delivery_logs" ADD CONSTRAINT "webhook_delivery_logs_webhook_endpoint_id_fkey" FOREIGN KEY ("webhook_endpoint_id") REFERENCES "webhook_endpoints"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_provider_configs" ADD CONSTRAINT "wallet_provider_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_provider_configs" ADD CONSTRAINT "notification_provider_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_mock_log" ADD CONSTRAINT "notification_mock_log_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_recipients" ADD CONSTRAINT "message_recipients_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "platform_messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_lines" ADD CONSTRAINT "credit_lines_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_lines" ADD CONSTRAINT "credit_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_lines" ADD CONSTRAINT "credit_lines_lender_id_fkey" FOREIGN KEY ("lender_id") REFERENCES "lenders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_cycle_histories" ADD CONSTRAINT "billing_cycle_histories_credit_line_id_fkey" FOREIGN KEY ("credit_line_id") REFERENCES "credit_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drawdowns" ADD CONSTRAINT "drawdowns_credit_line_id_fkey" FOREIGN KEY ("credit_line_id") REFERENCES "credit_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_limit_changes" ADD CONSTRAINT "credit_limit_changes_credit_line_id_fkey" FOREIGN KEY ("credit_line_id") REFERENCES "credit_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "micro_loan_credit_limit_changes" ADD CONSTRAINT "micro_loan_credit_limit_changes_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "micro_loan_credit_limit_changes" ADD CONSTRAINT "micro_loan_credit_limit_changes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aging_bucket_configs" ADD CONSTRAINT "aging_bucket_configs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bnpl_transactions" ADD CONSTRAINT "bnpl_transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bnpl_transactions" ADD CONSTRAINT "bnpl_transactions_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bnpl_transactions" ADD CONSTRAINT "bnpl_transactions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bnpl_transactions" ADD CONSTRAINT "bnpl_transactions_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "merchant_settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bnpl_transactions" ADD CONSTRAINT "bnpl_transactions_lender_id_fkey" FOREIGN KEY ("lender_id") REFERENCES "lenders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_schedules" ADD CONSTRAINT "installment_schedules_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "bnpl_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_settlements" ADD CONSTRAINT "merchant_settlements_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bnpl_credit_lines" ADD CONSTRAINT "bnpl_credit_lines_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bnpl_credit_lines" ADD CONSTRAINT "bnpl_credit_lines_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bnpl_credit_lines" ADD CONSTRAINT "bnpl_credit_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bnpl_credit_line_adjustments" ADD CONSTRAINT "bnpl_credit_line_adjustments_credit_line_id_fkey" FOREIGN KEY ("credit_line_id") REFERENCES "bnpl_credit_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_debtor_id_fkey" FOREIGN KEY ("debtor_id") REFERENCES "debtors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_line_items" ADD CONSTRAINT "billing_line_items_billing_invoice_id_fkey" FOREIGN KEY ("billing_invoice_id") REFERENCES "billing_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disbursement_fees" ADD CONSTRAINT "disbursement_fees_disbursement_id_fkey" FOREIGN KEY ("disbursement_id") REFERENCES "disbursements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disbursement_fees" ADD CONSTRAINT "disbursement_fees_billing_invoice_id_fkey" FOREIGN KEY ("billing_invoice_id") REFERENCES "billing_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_financial_data" ADD CONSTRAINT "customer_financial_data_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scorecard_configs" ADD CONSTRAINT "scorecard_configs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operator_approval_limits" ADD CONSTRAINT "operator_approval_limits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipeline_step_logs" ADD CONSTRAINT "pipeline_step_logs_loan_request_id_fkey" FOREIGN KEY ("loan_request_id") REFERENCES "loan_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_distribution_configs" ADD CONSTRAINT "revenue_distribution_configs_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upgrade_requests" ADD CONSTRAINT "upgrade_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

