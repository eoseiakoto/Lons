import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Sprint 12 Phase 4B — Seller-facing Invoice Factoring REST DTOs.
 *
 * All monetary fields are Decimal-as-string (CLAUDE.md). The shared
 * `MONEY_REGEX` enforces the same validation surface used elsewhere in
 * the rest-server (see `bnpl-purchase.dto.ts`).
 */
const MONEY_REGEX = /^\d+(\.\d{1,4})?$/;

export class SubmitInvoiceDto {
  @ApiProperty({
    description: 'Idempotency key — repeated submissions short-circuit and return the same invoice.',
    example: 'invoice-submit-2026-05-03-001',
  })
  @IsString()
  @Length(1, 255)
  idempotencyKey!: string;

  @ApiProperty({
    description: 'Customer UUID of the seller (the entity factoring its receivable).',
    example: '11111111-1111-1111-1111-111111111111',
  })
  @IsString()
  sellerId!: string;

  @ApiProperty({
    description: 'Debtor (buyer) UUID. Must already exist for this tenant.',
    example: '22222222-2222-2222-2222-222222222222',
  })
  @IsString()
  debtorId!: string;

  @ApiProperty({
    description: 'Invoice-financing product UUID.',
    example: '33333333-3333-3333-3333-333333333333',
  })
  @IsString()
  productId!: string;

  @ApiProperty({
    description: "Seller's invoice number — unique per (tenant, seller).",
    example: 'INV-2026-0042',
  })
  @IsString()
  @Length(1, 100)
  invoiceNumber!: string;

  @ApiProperty({
    description: 'Issue date — ISO 8601 calendar date (YYYY-MM-DD). Cannot be in the future.',
    example: '2026-04-15',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  issueDate!: string;

  @ApiProperty({
    description: 'Due date — ISO 8601 calendar date (YYYY-MM-DD). Must be strictly after today.',
    example: '2026-07-15',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDate!: string;

  @ApiProperty({
    description:
      'Face value of the invoice as a decimal string (max 4 dp). ' +
      'Money MUST be a string per CLAUDE.md §Money.',
    example: '100000.0000',
  })
  @IsString()
  @Matches(MONEY_REGEX)
  faceValue!: string;

  @ApiProperty({
    description: 'ISO 4217 currency code.',
    example: 'GHS',
  })
  @IsString()
  @Length(3, 3)
  currency!: string;

  @ApiPropertyOptional({
    description: 'Recourse model. Defaults to "with_recourse" when omitted.',
    enum: ['with_recourse', 'without_recourse'],
    example: 'with_recourse',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(with_recourse|without_recourse)$/)
  recourseType?: 'with_recourse' | 'without_recourse';

  @ApiPropertyOptional({
    description: 'Optional supporting documents (invoice PDF refs, delivery note, etc.).',
    example: { invoicePdf: 's3://bucket/inv-2026-0042.pdf' },
  })
  @IsOptional()
  documents?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Free-form metadata stored alongside the invoice.',
    example: { sellerRef: 'PO-9921' },
  })
  @IsOptional()
  metadata?: Record<string, unknown>;
}

export class AcceptOfferDto {
  @ApiProperty({
    description: 'Idempotency key. Repeated acceptances are no-ops.',
    example: 'invoice-accept-2026-05-03-001',
  })
  @IsString()
  @Length(1, 255)
  idempotencyKey!: string;
}

export class DeclineOfferDto {
  @ApiPropertyOptional({
    description: 'Optional reason for declining the offer.',
    example: 'Rate too high',
  })
  @IsOptional()
  @IsString()
  @Length(1, 500)
  reason?: string;
}

export class CreateDebtorDto {
  @ApiProperty({
    description: 'Full legal name of the debtor company.',
    example: 'Acme Distributors Ltd.',
  })
  @IsString()
  @Length(1, 255)
  companyName!: string;

  @ApiProperty({
    description: 'ISO-3 country code.',
    example: 'GHA',
  })
  @IsString()
  @Length(2, 3)
  country!: string;

  @ApiPropertyOptional({ description: 'Trading / brand name.', example: 'Acme' })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  tradingName?: string;

  @ApiPropertyOptional({
    description: 'Company registration number (jurisdiction-specific).',
    example: 'CS123456789',
  })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  registrationNumber?: string;

  @ApiPropertyOptional({ description: 'Tax ID / TIN.', example: 'TIN-1234' })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  taxId?: string;

  @ApiPropertyOptional({
    description: 'Industry sector (free-form or NACE / NAICS code).',
    example: 'retail',
  })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  industrySector?: string;

  @ApiPropertyOptional({ description: 'Primary contact email.', example: 'ap@acme.example' })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  contactEmail?: string;

  @ApiPropertyOptional({ description: 'Primary contact phone.', example: '+233244000000' })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  contactPhone?: string;

  @ApiPropertyOptional({ description: 'Primary contact name.', example: 'Akua Mensah' })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  contactName?: string;

  @ApiPropertyOptional({
    description: 'Standard payment terms (free-form).',
    example: 'Net 60',
  })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  paymentTerms?: string;

  @ApiPropertyOptional({
    description: 'External credit rating (e.g. "BBB+", "AAA").',
    example: 'BBB+',
  })
  @IsOptional()
  @IsString()
  @Length(1, 50)
  externalCreditRating?: string;

  @ApiPropertyOptional({
    description:
      'Exposure cap for this debtor as a decimal string (max 4 dp). ' +
      'Money MUST be a string per CLAUDE.md §Money.',
    example: '500000.0000',
  })
  @IsOptional()
  @IsString()
  @Matches(MONEY_REGEX)
  exposureLimit?: string;

  @ApiPropertyOptional({
    description: 'Optional postal address payload.',
    example: { line1: '12 High St', city: 'Accra' },
  })
  @IsOptional()
  address?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'Free-form metadata stored alongside the debtor.',
    example: { source: 'manual_import' },
  })
  @IsOptional()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({
    description:
      'Idempotency hint. With the same value + (companyName, registrationNumber) the create returns the existing row.',
    example: 'debtor-create-2026-05-03-001',
  })
  @IsOptional()
  @IsString()
  @Length(1, 255)
  idempotencyKey?: string;
}

export class DebtorListQueryDto {
  @ApiPropertyOptional({
    description: 'Cursor — debtor `id` of the last row from the previous page.',
    example: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Page size. Defaults to 20, capped at 100.',
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Filter by status.',
    enum: ['active', 'suspended', 'blacklisted'],
    example: 'active',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(active|suspended|blacklisted)$/)
  status?: 'active' | 'suspended' | 'blacklisted';

  @ApiPropertyOptional({
    description: 'Filter by industry sector (exact match).',
    example: 'retail',
  })
  @IsOptional()
  @IsString()
  industrySector?: string;

  @ApiPropertyOptional({
    description: 'Filter by ISO-3 country code (exact match).',
    example: 'GHA',
  })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({
    description: 'Free-text search across companyName + registrationNumber.',
    example: 'Acme',
  })
  @IsOptional()
  @IsString()
  search?: string;
}
