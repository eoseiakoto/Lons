-- S13-2: Track actual debtor payment date for accurate risk scoring.
-- Replaces the unreliable updatedAt proxy in debtor risk calculation
-- (debtor.service.ts assessRisk). Set on the first payment event in
-- ReserveService.recordDebtorPayment.
ALTER TABLE "invoices" ADD COLUMN "debtor_paid_at" TIMESTAMPTZ(6);
