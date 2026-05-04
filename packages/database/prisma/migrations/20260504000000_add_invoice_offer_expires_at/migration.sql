-- Sprint 12 pre-S13 FIX 1 (F-IF-1): persist offer expiry on invoices so
-- generateOffer's expiresAt is durable and acceptOffer can validate it.
-- The companion scheduler job (invoice-offer-expiry.job) sweeps stale
-- offers hourly and cancels them.

ALTER TABLE "invoices" ADD COLUMN "offer_expires_at" TIMESTAMPTZ(6);
