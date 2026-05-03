-- AlterEnum
ALTER TYPE "CustomerStatus" ADD VALUE 'anonymized';

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "anonymized_at" TIMESTAMPTZ(6),
ADD COLUMN     "anonymized_by" UUID;
