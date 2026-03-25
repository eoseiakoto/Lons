import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuidv4 } from 'uuid';

export interface IBaseEvent<T = unknown> {
  event: string;
  tenantId: string;
  timestamp: string;
  correlationId: string;
  data: T;
}

@Injectable()
export class EventBusService {
  constructor(private eventEmitter: EventEmitter2) {}

  emit<T>(event: IBaseEvent<T>): void {
    this.eventEmitter.emit(event.event, event);
  }

  buildEvent<T>(eventType: string, tenantId: string, data: T, correlationId?: string): IBaseEvent<T> {
    return {
      event: eventType,
      tenantId,
      timestamp: new Date().toISOString(),
      correlationId: correlationId || uuidv4(),
      data,
    };
  }

  emitAndBuild<T>(eventType: string, tenantId: string, data: T, correlationId?: string): void {
    const event = this.buildEvent(eventType, tenantId, data, correlationId);
    this.emit(event);
  }
}
