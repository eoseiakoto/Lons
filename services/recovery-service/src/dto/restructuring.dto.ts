import { InputType, ObjectType, Field, Int } from '@nestjs/graphql';
import { IsOptional, IsInt, IsString, IsBoolean } from 'class-validator';

@InputType()
export class RestructuringInput {
  @IsOptional()
  @IsInt()
  @Field({ nullable: true, description: 'New loan tenor in days' })
  newTenorDays?: number;

  @IsOptional()
  @IsString()
  @Field({ nullable: true, description: 'New installment amount as Decimal string' })
  newInstallmentAmount?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true, description: 'New annual interest rate as Decimal string' })
  newInterestRate?: string;

  @IsOptional()
  @IsBoolean()
  @Field({ nullable: true, description: 'Whether to waive all outstanding penalties' })
  penaltyWaiver?: boolean;

  @IsOptional()
  @IsInt()
  @Field({ nullable: true, description: 'Number of days for payment holiday' })
  paymentHolidayDays?: number;

  @IsString()
  @Field({ description: 'Reason for restructuring' })
  reason!: string;
}

@ObjectType()
export class RestructuringResultType {
  @Field()
  contractId!: string;

  @Field()
  success!: boolean;

  @Field()
  originalTenorDays!: number;

  @Field()
  newTenorDays!: number;

  @Field()
  originalInterestRate!: string;

  @Field()
  newInterestRate!: string;

  @Field()
  originalOutstanding!: string;

  @Field()
  newOutstanding!: string;

  @Field(() => Int)
  restructureCount!: number;

  @Field()
  newScheduleEntries!: number;

  @Field()
  restructuredAt!: Date;
}
