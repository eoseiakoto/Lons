import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

export interface TenantSettings {
  ipWhitelist?: string[];
  [key: string]: unknown;
}

@Injectable()
export class IpWhitelistGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const tenantSettings: TenantSettings | undefined =
      req.user?.tenantSettings ?? req.tenantSettings;

    // No whitelist configured — allow all traffic
    if (!tenantSettings?.ipWhitelist || tenantSettings.ipWhitelist.length === 0) {
      return true;
    }

    const forwardedFor: string | undefined = req.headers['x-forwarded-for'];
    const clientIp: string =
      (forwardedFor ? forwardedFor.split(',')[0].trim() : undefined) ?? req.ip ?? '';

    return tenantSettings.ipWhitelist.includes(clientIp);
  }
}
