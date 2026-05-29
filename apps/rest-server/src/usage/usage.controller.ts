import {
  Controller,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { AuditAction } from '@lons/common';
import { UsageMetricsService } from '@lons/entity-service';

import { ApiKeyGuard } from '../guards/api-key.guard';

interface ApiKeyRequest extends Request {
  tenantId?: string;
}

/**
 * Sprint 14 (S14-14b) — REST usage metrics endpoint.
 *
 * Mirrors the `currentUsage` GraphQL query so SPs that integrate via
 * REST can poll their plan utilisation. The shape matches the GraphQL
 * `UsageSnapshot` exactly so client codegen stays consistent across
 * surfaces.
 */
@ApiTags('Usage')
@ApiSecurity('api-key')
@ApiSecurity('api-secret')
@UseGuards(ApiKeyGuard)
@Controller('usage')
export class UsageController {
  constructor(private readonly usageMetricsService: UsageMetricsService) {}

  @Get()
  @AuditAction('read.usageSnapshot', 'usage')
  @ApiOperation({
    summary: 'Get current plan usage snapshot',
    description:
      'Returns plan limits and current counters (DB + Redis) for the authenticated tenant. ' +
      'Authentication: API key + secret. Mirrors the GraphQL `currentUsage` query.',
  })
  @ApiResponse({
    status: 200,
    description: 'Plan limits + current counters (DB + Redis).',
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async getCurrentUsage(@Req() req: ApiKeyRequest): Promise<unknown> {
    const tenantId = req.tenantId;
    if (!tenantId) {
      throw new Error('ApiKeyGuard did not populate request.tenantId');
    }
    return this.usageMetricsService.getCurrentUsage(tenantId);
  }
}
