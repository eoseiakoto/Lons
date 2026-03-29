import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  correlationId: string;
  tenantId?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getCorrelationId(): string | undefined {
  return requestContext.getStore()?.correlationId;
}

export function getTenantId(): string | undefined {
  return requestContext.getStore()?.tenantId;
}
