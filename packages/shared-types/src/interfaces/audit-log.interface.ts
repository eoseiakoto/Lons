import { ActorType } from '../enums';
import { ITenantScoped } from './common.interface';

export interface IAuditLog extends ITenantScoped {
  id: string;
  actorId?: string;
  actorType: ActorType;
  actorIp?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  beforeValue?: Record<string, unknown>;
  afterValue?: Record<string, unknown>;
  correlationId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}
