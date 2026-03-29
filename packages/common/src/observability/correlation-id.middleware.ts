import { Injectable, NestMiddleware } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { requestContext } from './correlation-id.context';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void): void {
    const correlationId =
      (req.headers?.['x-correlation-id'] as string) || uuidv4();
    const tenantId = req.headers?.['x-tenant-id'] as string | undefined;

    res.setHeader('X-Correlation-ID', correlationId);

    requestContext.run({ correlationId, tenantId }, () => {
      next();
    });
  }
}
