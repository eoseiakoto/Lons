import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiQuery,
} from '@nestjs/swagger';
import { ContractService } from '@lons/process-engine';
import { ScheduleService } from '@lons/repayment-service';
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
  ) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get contract details' })
  @ApiResponse({ status: 200, description: 'Contract details' })
  @ApiResponse({ status: 404, description: 'Contract not found' })
  async findOne(@Req() req: any, @Param('id') id: string): Promise<any> {
    const tenantId = req.tenantId;
    return this.contractService.findById(tenantId, id);
  }

  @Get(':id/schedule')
  @ApiOperation({ summary: 'Get repayment schedule for a contract' })
  @ApiResponse({ status: 200, description: 'Repayment schedule' })
  @ApiResponse({ status: 404, description: 'Contract not found' })
  async schedule(@Req() req: any, @Param('id') id: string): Promise<any> {
    const tenantId = req.tenantId;
    return this.scheduleService.getSchedule(tenantId, id);
  }

  @Get()
  @ApiOperation({ summary: 'List contracts with pagination' })
  @ApiResponse({ status: 200, description: 'Paginated list of contracts' })
  @ApiQuery({ name: 'customerId', required: false, description: 'Filter by customer ID' })
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
}
