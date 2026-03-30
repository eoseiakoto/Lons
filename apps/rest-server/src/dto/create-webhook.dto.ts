import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsArray, IsOptional, IsBoolean, IsUrl } from 'class-validator';

export class CreateWebhookDto {
  @ApiProperty({ description: 'Webhook target URL', example: 'https://example.com/hooks/lons' })
  @IsUrl()
  url!: string;

  @ApiProperty({
    description: 'List of event types to subscribe to',
    example: ['contract.state_changed', 'repayment.received'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  events!: string[];

  @ApiProperty({ required: false, default: true, description: 'Whether the webhook is active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
