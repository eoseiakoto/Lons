import { Controller, Get, Res } from '@nestjs/common';

import { MetricsService } from './metrics.service';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  async getMetrics(@Res() res: any): Promise<void> {
    const registry = this.metricsService.getRegistry();
    const metrics = await registry.metrics();
    res.setHeader('Content-Type', registry.contentType);
    res.send(metrics);
  }
}
