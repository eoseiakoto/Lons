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
} from '@nestjs/swagger';
import { WebhookService } from '@lons/entity-service';
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
  @ApiOperation({ summary: 'Register a new webhook endpoint' })
  @ApiResponse({ status: 201, description: 'Webhook registered' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiHeader({ name: 'X-Idempotency-Key', required: false, description: 'Idempotency key for duplicate prevention' })
  async create(@Req() req: any, @Body() body: CreateWebhookDto) {
    const tenantId = req.tenantId;
    return this.webhookService.registerWebhook(tenantId, {
      targetUrl: body.url,
      events: body.events,
      isActive: body.isActive ?? true,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List registered webhooks' })
  @ApiResponse({ status: 200, description: 'List of webhooks' })
  async findAll(@Req() req: any) {
    const tenantId = req.tenantId;
    return this.webhookService.getConfigs(tenantId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove a webhook registration' })
  @ApiResponse({ status: 204, description: 'Webhook removed' })
  @ApiResponse({ status: 404, description: 'Webhook not found' })
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
