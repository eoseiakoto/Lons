import { InputType, ObjectType, Field, ID, Float } from '@nestjs/graphql';
import { IsOptional, IsString, IsEnum, IsUUID } from 'class-validator';
import { RecoveryStrategyTypeEnum } from './recovery-strategy.dto';

@InputType()
export class RecoveryOutcomeInput {
  @IsEnum(RecoveryStrategyTypeEnum)
  @Field(() => RecoveryStrategyTypeEnum)
  strategyType!: RecoveryStrategyTypeEnum;

  @IsOptional()
  @IsString()
  @Field({ nullable: true, description: 'JSON string of strategy parameters' })
  strategyParams?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  notes?: string;

  @IsOptional()
  @IsUUID()
  @Field({ nullable: true })
  appliedBy?: string;
}

@InputType()
export class UpdateRecoveryOutcomeInput {
  @IsString()
  @Field()
  status!: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true, description: 'Amount recovered as Decimal string' })
  amountRecovered?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  notes?: string;
}

@ObjectType()
export class RecoveryOutcomeType {
  @Field(() => ID)
  id!: string;

  @Field()
  tenantId!: string;

  @Field()
  contractId!: string;

  @Field()
  strategyType!: string;

  @Field({ nullable: true })
  status!: string;

  @Field({ nullable: true })
  amountRecovered?: string;

  @Field({ nullable: true })
  daysToResolution?: number;

  @Field({ nullable: true })
  notes?: string;

  @Field({ nullable: true })
  appliedBy?: string;

  @Field()
  appliedAt!: Date;

  @Field({ nullable: true })
  resolvedAt?: Date;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}

@ObjectType()
export class StrategyEffectivenessType {
  @Field()
  strategyType!: string;

  @Field(() => Float)
  successRate!: number;

  @Field()
  avgRecovery!: string;

  @Field(() => Float)
  avgDaysToResolve!: number;

  @Field()
  totalOutcomes!: number;
}
