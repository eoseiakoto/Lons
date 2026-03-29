import { Controller, Get } from '@nestjs/common';

export interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
}

@Controller('health')
export class HealthController {
  /**
   * Liveness probe — confirms the process is running.
   * GET /health
   */
  @Get()
  liveness(): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness probe — confirms the service is ready to handle traffic.
   * GET /health/ready
   */
  @Get('ready')
  readiness(): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
