import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiSecurity,
  ApiQuery,
  ApiParam,
  ApiHeader,
} from '@nestjs/swagger';
import { ContractService, CoolingOffService } from '@lons/process-engine';
import { ScheduleService } from '@lons/repayment-service';
import { AuditAction } from '@lons/common';
import { ApiKeyGuard } from '../guards/api-key.guard';
import { PaginationQueryDto, buildPaginatedResponse } from '../dto/pagination.dto';

@ApiTags('Contracts')
@ApiSecurity('api-key')
@ApiSecurity('api-secret')
@UseGuards(ApiKeyGuard)
@Controller('contracts')
export class ContractController {
  constructor(
    private readonly contractService: ContractService,
    private readonly scheduleService: ScheduleService,
    private readonly coolingOffService: CoolingOffService,
  ) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Get a contract by ID',
    description: 'Returns full contract details including outstanding balance and current status.',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', description: 'Contract UUID' })
  @ApiResponse({ status: 200, description: 'Contract details' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 404, description: 'Contract not found' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async findOne(@Req() req: any, @Param('id') id: string): Promise<any> {
    const tenantId = req.tenantId;
    return this.contractService.findById(tenantId, id);
  }

  @Get(':id/schedule')
  @ApiOperation({
    summary: 'Get a contract repayment schedule',
    description: 'Returns the full installment schedule for a contract, including dues, payments, and remaining balances.',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', description: 'Contract UUID' })
  @ApiResponse({ status: 200, description: 'Repayment schedule (installments are decimal-string monetary fields).' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 404, description: 'Contract not found' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async schedule(@Req() req: any, @Param('id') id: string): Promise<any> {
    const tenantId = req.tenantId;
    return this.scheduleService.getSchedule(tenantId, id);
  }

  @Get()
  @ApiOperation({
    summary: 'List contracts',
    description: 'Paginated list of contracts for the authenticated tenant with optional filters.',
  })
  @ApiResponse({ status: 200, description: 'Paginated list of contracts' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @ApiQuery({ name: 'customerId', required: false, description: 'Filter by customer UUID' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by contract status' })
  async findAll(
    @Req() req: any,
    @Query() pagination: PaginationQueryDto,
    @Query('customerId') customerId?: string,
    @Query('status') status?: string,
  ): Promise<any> {
    const tenantId = req.tenantId;
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? 20;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.contractService.findAll(tenantId, { skip, take: limit, customerId, status }),
      this.contractService.count(tenantId, { customerId, status }),
    ]);

    return buildPaginatedResponse(items, total, page, limit);
  }

  @Post(':id/cancel-cooling-off')
  @AuditAction('cancel.contractCoolingOff', 'contract')
  @ApiOperation({
    summary: 'Cancel a contract during cooling-off',
    description:
      'Cancels a recently disbursed contract while still within its cooling-off window. ' +
      'Idempotent via the required idempotencyKey body field.',
  })
  @ApiParam({ name: 'id', type: String, format: 'uuid', description: 'Contract UUID' })
  @ApiResponse({ status: 200, description: 'Contract cancelled during cooling-off' })
  @ApiResponse({ status: 400, description: 'Contract not in cooling-off period' })
  @ApiResponse({ status: 401, description: 'Missing or invalid API key' })
  @ApiResponse({ status: 404, description: 'Contract not found' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @ApiHeader({ name: 'X-Idempotency-Key', required: false, description: 'Optional retry-safe key (in addition to the body-level idempotencyKey).' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Optional cancellation reason' },
        idempotencyKey: { type: 'string', description: 'Idempotency key — required by the service for safe retries.' },
      },
      required: ['idempotencyKey'],
    },
  })
  async cancelCoolingOff(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { reason?: string; idempotencyKey: string },
  ): Promise<any> {
    const tenantId = req.tenantId;
    return this.coolingOffService.cancelDuringCoolingOff(tenantId, id, body.reason, body.idempotencyKey);
  }
}
