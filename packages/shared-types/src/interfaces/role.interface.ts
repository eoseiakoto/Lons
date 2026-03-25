import { IBaseEntity, ITenantScoped } from './common.interface';

export interface IRole extends IBaseEntity, ITenantScoped {
  name: string;
  description?: string;
  permissions: string[];
  isSystem: boolean;
}
