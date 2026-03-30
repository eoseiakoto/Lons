import { PrismaClient } from '@prisma/client';
import { createKeyProvider, encryptToString } from '@lons/common';

const BATCH_SIZE = 100;
const PII_FIELDS = ['nationalId', 'phonePrimary', 'phoneSecondary', 'email', 'dateOfBirth', 'fullName'];

function isEncryptedBlob(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null && 'ciphertext' in parsed && 'iv' in parsed && 'tag' in parsed;
  } catch {
    return false;
  }
}

async function main() {
  const prisma = new PrismaClient();
  const keyProvider = createKeyProvider();
  const key = await keyProvider.getKey();

  let cursor: string | undefined;
  let totalProcessed = 0;
  let totalEncrypted = 0;
  let totalErrors = 0;

  const totalCount = await prisma.customer.count();
  console.log(`Starting PII encryption migration for ${totalCount} customers...`);

  while (true) {
    const customers = await prisma.customer.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
    });

    if (customers.length === 0) break;

    for (const customer of customers) {
      try {
        const updates: Record<string, string> = {};

        for (const field of PII_FIELDS) {
          const value = (customer as Record<string, unknown>)[field];
          if (value == null || isEncryptedBlob(value)) continue;
          updates[field] = encryptToString(String(value), key);
        }

        if (Object.keys(updates).length > 0) {
          await prisma.customer.update({
            where: { id: customer.id },
            data: updates,
          });
          totalEncrypted++;
        }
      } catch (error) {
        console.error(`Error encrypting customer ${customer.id}:`, error);
        totalErrors++;
      }

      totalProcessed++;
    }

    cursor = customers[customers.length - 1].id;
    console.log(`Progress: ${totalProcessed}/${totalCount} customers processed, ${totalEncrypted} encrypted, ${totalErrors} errors`);
  }

  console.log(`\nMigration complete:`);
  console.log(`  Total processed: ${totalProcessed}`);
  console.log(`  Total encrypted: ${totalEncrypted}`);
  console.log(`  Total errors: ${totalErrors}`);

  await prisma.$disconnect();
  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
