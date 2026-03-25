import { EventType } from './events.enum';

export interface IBaseEvent<T = unknown> {
  event: EventType;
  tenantId: string;
  timestamp: string;
  correlationId: string;
  data: T;
}
