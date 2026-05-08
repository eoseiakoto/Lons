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
 * S13-1: At least one of `invoiceNumber`, `debtorRef`, or `paymentRef` must be
 * present in the body — otherwise we have nothing to match against. Implemented
 * as a class-level constraint applied to a synthetic property so we can return
 * a single coherent validation error.
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
              (obj.debtorRef && obj.debtorRef.length > 0) ||
              (obj.paymentRef && obj.paymentRef.length > 0),
          );
        },
        defaultMessage() {
          return 'at least one of invoiceNumber, debtorRef, or paymentRef must be provided';
        },
      },
    });
  };
}

export class DebtorPaymentWebhookDto {
  @ApiProperty({ description: "Provider's transaction reference" })
  @IsString()
  @IsNotEmpty()
  transactionRef!: string;

  @ApiProperty({
    description: 'Amount received as a Decimal-as-string (max 4 dp)',
    example: '50000.00',
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
      'Invoice number (preferred matching strategy). Either this, debtorRef, or paymentRef must be provided.',
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
      "Optional payment reference (e.g. seller's own payment ref printed on the invoice).",
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
