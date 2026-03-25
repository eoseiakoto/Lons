import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Webhooks')
@ApiBearerAuth()
@Controller('v1/webhooks')
export class WebhookController {
  @Post()
  @ApiOperation({ summary: 'Register a webhook endpoint' })
  @ApiResponse({ status: 201, description: 'Webhook registered' })
  async create(@Body() body: any) {
    return {
      message: 'Webhook registration endpoint — connect to WebhookService',
      id: crypto.randomUUID(),
    };
  }

  @Get()
  @ApiOperation({ summary: 'List registered webhooks' })
  async findAll() {
    return {
      message: 'Webhook list endpoint — connect to WebhookService',
      webhooks: [],
    };
  }
}
