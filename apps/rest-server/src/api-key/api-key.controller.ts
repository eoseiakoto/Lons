import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiHeader,
} from '@nestjs/swagger';
import { ApiKeyRotationService } from '@lons/entity-service';
import { ApiKeyGuard } from '../guards/api-key.guard';
import { IdempotencyInterceptor } from '../interceptors/idempotency.interceptor';
import { RotateApiKeyDto } from '../dto/rotate-api-key.dto';

@ApiTags('API Keys')
@ApiSecurity('api-key')
@ApiSecurity('api-secret')
@UseGuards(ApiKeyGuard)
@Controller('api-keys')
export class ApiKeyController {
  constructor(
    private readonly apiKeyRotationService: ApiKeyRotationService,
  ) {}

  @Post('rotate')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({
    summary: 'Rotate API secret',
    description: 'Generates a new API key/secret pair. The old key remains valid for the specified grace period (default 24 hours).',
  })
  @ApiResponse({ status: 200, description: 'New API key and secret returned. Store the secret securely — it cannot be retrieved again.' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'API key not found' })
  @ApiHeader({ name: 'X-Idempotency-Key', required: false, description: 'Idempotency key for duplicate prevention' })
  async rotate(@Req() req: any, @Body() body: RotateApiKeyDto) {
    const tenantId = req.tenantId;
    const result = await this.apiKeyRotationService.rotateApiKey(
      tenantId,
      body.apiKeyId,
      body.gracePeriodHours ?? 24,
    );

    return {
      id: result.id,
      key: result.key,
      secret: result.secret,
      name: result.name,
      gracePeriodHours: body.gracePeriodHours ?? 24,
      createdAt: result.createdAt,
    };
  }
}
