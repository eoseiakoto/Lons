import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Req,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiHeader,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { WebhookService } from '@lons/entity-service';
import { AuditAction } from '@lons/common';
import { ApiKeyGuard } from '../guards/api-key.guard';
import { IdempotencyInterceptor } from '../interceptors/idempotency.interceptor';
import { CreateWebhookDto } from '../dto/create-webhook.dto';

@ApiTags('Webhooks')
@ApiSecurity('api-key')
@ApiSecurity('api-secret')
@UseGuards(ApiKeyGuard)
@Controller('webhooks')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(IdempotencyInterceptor)
  @AuditAction('register.webhook', 'webhook')
  @ApiOperation({
    summary: 'Register a webhook endpoint',
    description:
      'Registers a URL to receive event notifications. ' +
      'Authentication: API key + secret. Idempotent via X-Idempotency-Key.',
  })
  @ApiBody({ type: CreateWebhookDto })
  @ApiResponse({ status: 201, description: 'Webhook registered' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @ApiHeader({ name: 'X-Idempotency-Key', required: false, description: 'Prevents duplicate operations on retry.' })
  async create(@Req() req: any, @Body() body: CreateWebhookDto) {
    const tenantId = req.tenantId;
    return this.webhookService.registerWebhook(tenantId, {
      targetUrl: body.url,
      events: body.events,
      isActive: body.isActive ?? true,
    });
  }

  @Get()
  @ApiOperation({
    summary: 'List registered webhooks',
    description: 'Returns all webhook registrations for the authenticated tenant.',
  })
  @ApiResponse({ status: 200, description: 'List of webhooks' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async findAll(@Req() req: any) {
    const tenantId = req.tenantId;
    return this.webhookService.getConfigs(tenantId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AuditAction('delete.webhook', 'webhook')
  @ApiOperation({
    summary: 'Remove a webhook registration',
    description: 'Deactivates the webhook so it no longer receives events.',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', description: 'Webhook UUID' })
  @ApiResponse({ status: 204, description: 'Webhook removed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 404, description: 'Webhook not found' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async remove(@Req() req: any, @Param('id') id: string) {
    const tenantId = req.tenantId;
    // Remove the webhook by filtering it out via the service
    // The webhook service stores in memory; we filter by id
    const configs = this.webhookService.getConfigs(tenantId);
    const found = configs.find((c: any) => c.id === id);
    if (!found) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: `Webhook ${id} not found`,
      });
    }
    // Mark inactive (in-memory service doesn't have delete, so we deactivate)
    found.isActive = false;
    return;
  }
}
