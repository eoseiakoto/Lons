import { Field, InputType, Int } from '@nestjs/graphql';
import { IsDate, IsInt, IsOptional, IsString } from 'class-validator';

/**
 * Sprint 18 (S18-2 / FR-LO-003.2) — operator write-operation inputs.
 *
 * All money values are Decimal strings per CLAUDE.md.
 *
 * FIX-STAB-1: every @Field carries a class-validator decorator so the
 * global ValidationPipe (whitelist + forbidNonWhitelisted) doesn't 400
 * legitimate calls.
 */

@InputType()
export class ManualPaymentInput {
  /** Decimal string. */
  @IsString()
  @Field()
  amount!: string;

  @IsString()
  @Field()
  currency!: string;

  /** cash | bank_transfer | cheque | mobile_money */
  @IsString()
  @Field()
  paymentMethod!: string;

  /** External reference (bank txn id, cheque #, etc.). */
  @IsString()
  @Field()
  paymentRef!: string;

  @IsOptional()
  @IsDate()
  @Field({ nullable: true })
  paymentDate?: Date;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  notes?: string;
}

@InputType()
export class RestructureContractInput {
  @IsOptional()
  @IsInt()
  @Field(() => Int, { nullable: true })
  newTenorDays?: number;

  /** Decimal string e.g. "15.0000". */
  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  newInterestRate?: string;

  @IsOptional()
  @IsDate()
  @Field({ nullable: true })
  newMaturityDate?: Date;

  @IsString()
  @Field()
  restructureReason!: string;
}

@InputType()
export class WaivePenaltiesInput {
  /** Decimal string. */
  @IsString()
  @Field()
  waiverAmount!: string;

  @IsString()
  @Field()
  waiverReason!: string;
}
