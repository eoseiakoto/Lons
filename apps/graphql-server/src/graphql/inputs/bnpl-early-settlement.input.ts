import { Field, ID, InputType, Int } from '@nestjs/graphql';
import { IsArray, IsInt, IsString, IsUUID } from 'class-validator';

/**
 * GraphQL input shapes for the BNPL early-settlement and advance-payment
 * mutations (Sprint 12 G3). Both accept `idempotencyKey` for client-side
 * replay safety.
 *
 * FIX-STAB-1: every @Field carries a class-validator decorator so the
 * global ValidationPipe (whitelist + forbidNonWhitelisted) doesn't 400
 * legitimate calls.
 */

@InputType()
export class EarlySettlementInput {
  @IsUUID()
  @Field(() => ID) transactionId!: string;

  @IsString()
  @Field() idempotencyKey!: string;
}

@InputType()
export class AdvancePaymentInput {
  @IsUUID()
  @Field(() => ID) transactionId!: string;

  /** Installment numbers to pay in advance. */
  @IsArray()
  @IsInt({ each: true })
  @Field(() => [Int]) installmentNumbers!: number[];

  @IsString()
  @Field() idempotencyKey!: string;
}
