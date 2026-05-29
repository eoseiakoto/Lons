import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateIf,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

/**
 * At least one of `invoiceNumber` or `debtorRef` must be present in the body —
 * otherwise we have no matching strategy. `paymentRef` is supplementary
 * metadata and does not drive matching, so it does NOT satisfy the constraint
 * (S13B-4 fix: F-S13-1).
 */
function HasAtLeastOneMatcher(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'hasAtLeastOneMatcher',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(_value: unknown, args) {
          const obj = (args?.object ?? {}) as DebtorPaymentWebhookDto;
          return Boolean(
            (obj.invoiceNumber && obj.invoiceNumber.length > 0) ||
              (obj.debtorRef && obj.debtorRef.length > 0),
          );
        },
        defaultMessage() {
          return 'at least one of invoiceNumber or debtorRef must be provided';
        },
      },
    });
  };
}

export class DebtorPaymentWebhookDto {
  @ApiProperty({
    description: "Provider's transaction reference (used for idempotency).",
    example: 'bank-x-txn-2026-05-29-abcd1234',
  })
  @IsString()
  @IsNotEmpty()
  transactionRef!: string;

  @ApiProperty({
    description:
      'Amount received as a decimal string (max 4 dp). ' +
      'Money MUST be a string per CLAUDE.md §Money.',
    example: '50000.0000',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'amount must be a valid decimal string',
  })
  amount!: string;

  @ApiProperty({ example: 'GHS', description: 'ISO-4217 currency code' })
  @IsString()
  @Length(3, 3)
  currency!: string;

  @ApiPropertyOptional({
    description:
      'Invoice number (preferred matching strategy). Either this or debtorRef must be provided.',
  })
  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @ApiPropertyOptional({
    description:
      'Debtor reference (registration number, tax id, or internal UUID). Falls back to FIFO match when invoiceNumber is missing.',
  })
  @IsOptional()
  @IsString()
  debtorRef?: string;

  @ApiPropertyOptional({
    description:
      "Supplementary payment reference metadata (e.g. seller's own payment ref printed on the invoice). Stored against the resulting payment record but does NOT drive matching — invoiceNumber or debtorRef is required for that.",
  })
  @IsOptional()
  @IsString()
  paymentRef?: string;

  @ApiPropertyOptional({
    description: 'Provider-specific metadata (free-form).',
    type: 'object',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  /**
   * Synthetic field — never set by callers. Carries the class-level
   * "at least one of …" constraint. `@ValidateIf(() => true)` ensures the
   * validator runs regardless of whether the property is in the payload.
   */
  @ValidateIf(() => true)
  @HasAtLeastOneMatcher()
  protected readonly _atLeastOneMatcher?: undefined;
}
