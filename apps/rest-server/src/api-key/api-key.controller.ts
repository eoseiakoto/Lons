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
  ApiBody,
} from '@nestjs/swagger';
import { ApiKeyRotationService } from '@lons/entity-service';
import { AuditAction } from '@lons/common';
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
  @AuditAction('rotate.apiKey', 'api_key')
  @ApiOperation({
    summary: 'Rotate an API secret',
    description:
      'Generates a new API key/secret pair. The old key remains valid for the specified grace period (default 24 hours, max 168 hours). ' +
      'Authentication: API key + secret. Idempotent via X-Idempotency-Key.',
  })
  @ApiBody({ type: RotateApiKeyDto })
  @ApiResponse({ status: 200, description: 'New API key and secret returned. Store the secret securely — it cannot be retrieved again.' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 404, description: 'API key not found' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @ApiHeader({ name: 'X-Idempotency-Key', required: false, description: 'Prevents duplicate operations on retry.' })
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
