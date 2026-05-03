import { Controller, Get, SetMetadata } from '@nestjs/common';

const IS_PUBLIC_KEY = 'isPublic';
const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

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
  @Public()
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
  @Public()
  @Get('ready')
  readiness(): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
