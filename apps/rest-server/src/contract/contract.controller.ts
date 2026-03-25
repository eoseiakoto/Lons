import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Contracts')
@ApiBearerAuth()
@Controller('v1/contracts')
export class ContractController {
  @Get(':id')
  @ApiOperation({ summary: 'Get contract details' })
  async findOne(@Param('id') id: string) {
    return { id, message: 'Contract detail endpoint — connect to ProcessEngine' };
  }

  @Get(':id/schedule')
  @ApiOperation({ summary: 'Get repayment schedule' })
  async schedule(@Param('id') id: string) {
    return {
      contractId: id,
      message: 'Repayment schedule endpoint — connect to RepaymentService',
    };
  }
}
