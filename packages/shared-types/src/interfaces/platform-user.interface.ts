import { UserStatus, PlatformUserRole } from '../enums';
import { IBaseEntity, ISoftDeletable } from './common.interface';

export interface IPlatformUser extends IBaseEntity, ISoftDeletable {
  email: string;
  passwordHash: string;
  name?: string;
  role: PlatformUserRole;
  mfaSecret?: string;
  mfaEnabled: boolean;
  lastLoginAt?: Date;
  lockedUntil?: Date;
  failedLoginCount: number;
  status: UserStatus;
}
