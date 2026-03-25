import { UserStatus } from '../enums';
import { IBaseEntity, ISoftDeletable, ITenantScoped } from './common.interface';

export interface IUser extends IBaseEntity, ISoftDeletable, ITenantScoped {
  email: string;
  passwordHash: string;
  name?: string;
  roleId: string;
  mfaSecret?: string;
  mfaEnabled: boolean;
  lastLoginAt?: Date;
  lockedUntil?: Date;
  failedLoginCount: number;
  status: UserStatus;
}
