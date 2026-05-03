/**
 * Sprint 11 A10 — backfill `wallet_account_mappings` from existing
 * `customer.metadata.walletId` values.
 *
 * Run after deploying the migration that creates the table:
 *   pnpm tsx scripts/backfill-wallet-account-mappings.ts
 *
 * Idempotent: uses `upsert` keyed on `(provider, wallet_id)` so re-running
 * is safe. Reports counts of inserted, updated, and skipped rows.
 *
 * Provider handling:
 *   Provider is read from `customer.metadata.walletProvider`. When that
 *   key is missing, the row is created with `provider = 'unknown'` so the
 *   backfill doesn't block on incomplete legacy data. **These rows will
 *   NEVER match a real webhook** — the webhook controller calls
 *   `resolveWallet(walletId, provider)` with the actual provider name
 *   (e.g. `mtn_momo`) from the URL, and `(unknown, walletId)` is a
 *   different unique-key pair from `(mtn_momo, walletId)`.
 *
 *   Ops MUST reconcile these rows once the real provider is known:
 *     UPDATE wallet_account_mappings
 *     SET provider = '<real_provider>'
 *     WHERE provider = 'unknown';
 *
 *   The summary at the end of the run reports the count so this isn't
 *   silently forgotten.
 */

import { PrismaClient, Prisma } from '@prisma/client';

const BATCH_SIZE = 500;

interface CustomerMetadata {
  walletId?: unknown;
  walletProvider?: unknown;
}

async function main() {
  const prisma = new PrismaClient();
  let inserted = 0;
  let updated = 0;
  let skippedNoWalletId = 0;
  let skippedCollision = 0;
  let unknownProviderCount = 0;
  let processed = 0;
  let cursor: string | undefined;

  // The script runs out-of-band of any HTTP request, so RLS would block
  // every read. Set platform-admin context for the duration.
  await prisma.$executeRaw`SELECT set_config('app.is_platform_admin', 'true', false)`;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const customers = await prisma.customer.findMany({
      where: {
        metadata: { not: Prisma.JsonNull },
        deletedAt: null,
      },
      select: { id: true, tenantId: true, metadata: true },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
    });
    if (customers.length === 0) break;

    for (const c of customers) {
      processed += 1;
      const meta = (c.metadata as CustomerMetadata | null) ?? null;
      const walletId = meta?.walletId ? String(meta.walletId) : null;
      if (!walletId) {
        skippedNoWalletId += 1;
        continue;
      }
      const provider = meta?.walletProvider ? String(meta.walletProvider) : 'unknown';

      try {
        const existing = await prisma.walletAccountMapping.findUnique({
          where: { provider_walletId: { provider, walletId } },
          select: { id: true, customerId: true, tenantId: true },
        });
        if (existing) {
          if (existing.customerId !== c.id || existing.tenantId !== c.tenantId) {
            // Collision — same (provider, walletId) already linked to a
            // different customer. Surface loudly; don't silently overwrite.
            console.error(
              `Collision: (${provider}, ${walletId.slice(0, 6)}…) maps to customer ${existing.customerId.slice(0, 8)}… in tenant ${existing.tenantId.slice(0, 8)}…, refusing to overwrite for customer ${c.id.slice(0, 8)}…`,
            );
            skippedCollision += 1;
            continue;
          }
          updated += 1;
        } else {
          await prisma.walletAccountMapping.create({
            data: {
              tenantId: c.tenantId,
              customerId: c.id,
              walletId,
              provider,
            },
          });
          inserted += 1;
          if (provider === 'unknown') unknownProviderCount += 1;
        }
      } catch (err) {
        console.error(`Failed for customer ${c.id.slice(0, 8)}…:`, err);
      }
    }

    cursor = customers[customers.length - 1].id;
    if (processed % 5000 === 0) {
      console.log(
        `…progress: processed=${processed} inserted=${inserted} updated=${updated} skipped=${skippedNoWalletId + skippedCollision}`,
      );
    }
  }

  console.log('\nBackfill complete.');
  console.log(`  customers processed:       ${processed}`);
  console.log(`  mappings inserted:         ${inserted}`);
  console.log(`  mappings already in sync:  ${updated}`);
  console.log(`  skipped (no walletId):     ${skippedNoWalletId}`);
  console.log(`  skipped (collision):       ${skippedCollision}`);

  if (unknownProviderCount > 0) {
    console.warn(
      `\nWARNING: ${unknownProviderCount} mapping(s) created with provider='unknown'.`,
    );
    console.warn(
      "These rows won't match inbound webhooks until ops reconciles them.",
    );
    console.warn('Run, with the real provider name substituted in:');
    console.warn(
      "  UPDATE wallet_account_mappings SET provider = '<real_provider>' WHERE provider = 'unknown';",
    );
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
