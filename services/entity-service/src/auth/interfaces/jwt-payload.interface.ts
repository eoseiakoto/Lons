export interface IJwtPayload {
  sub: string;
  tenantId: string;
  role: string;
  permissions: string[];
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

export interface IAuthenticatedUser {
  userId: string;
  tenantId: string;
  role: string;
  permissions: string[];
  isPlatformAdmin: boolean;
}
