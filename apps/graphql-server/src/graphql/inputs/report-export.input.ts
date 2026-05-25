import { Field, InputType, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { IsDate, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * Sprint 18 (S18-3) — CSV / PDF export inputs + result shape.
 */

export enum ReportTypeEnum {
  disbursement = 'disbursement',
  repayment = 'repayment',
  portfolio = 'portfolio',
  collections = 'collections',
  settlement = 'settlement',
}
registerEnumType(ReportTypeEnum, { name: 'ReportTypeEnum' });

export enum ExportFormatEnum {
  csv = 'csv',
  pdf = 'pdf',
}
registerEnumType(ExportFormatEnum, { name: 'ExportFormatEnum' });

@InputType()
export class ExportReportInput {
  @IsEnum(ReportTypeEnum)
  @Field(() => ReportTypeEnum)
  reportType!: ReportTypeEnum;

  @IsEnum(ExportFormatEnum)
  @Field(() => ExportFormatEnum)
  format!: ExportFormatEnum;

  @IsOptional()
  @IsDate()
  @Field({ nullable: true })
  dateFrom?: Date;

  @IsOptional()
  @IsDate()
  @Field({ nullable: true })
  dateTo?: Date;

  @IsOptional()
  @IsUUID()
  @Field({ nullable: true })
  productId?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  status?: string;
}

/**
 * Export result. `content` is the base64-encoded file payload — small
 * enough for the admin portal to download via a data URL without a
 * separate REST endpoint. For multi-MB exports a future enhancement
 * should swap this for a signed URL pointing at a temp store; the
 * current admin-portal export sizes (single tenant, single report)
 * stay well within the 10MB GraphQL response cap.
 */
@ObjectType()
export class ExportResultType {
  @Field()
  filename!: string;

  /** `text/csv` or `application/pdf`. */
  @Field()
  contentType!: string;

  /** Base64-encoded file body. */
  @Field()
  content!: string;

  @Field(() => Int)
  rowCount!: number;

  @Field()
  generatedAt!: Date;
}
