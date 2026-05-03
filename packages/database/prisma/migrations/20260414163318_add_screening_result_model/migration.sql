-- CreateEnum
CREATE TYPE "screening_status" AS ENUM ('CLEAR', 'MATCH', 'POTENTIAL_MATCH', 'ERROR');

-- CreateEnum
CREATE TYPE "screening_risk_level" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

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

-- CreateIndex
CREATE INDEX "screening_results_tenant_id_idx" ON "screening_results"("tenant_id");

-- CreateIndex
CREATE INDEX "screening_results_customer_id_idx" ON "screening_results"("customer_id");

-- CreateIndex
CREATE INDEX "screening_results_status_idx" ON "screening_results"("status");

-- CreateIndex
CREATE INDEX "screening_results_expires_at_idx" ON "screening_results"("expires_at");

-- AddForeignKey
ALTER TABLE "screening_results" ADD CONSTRAINT "screening_results_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
