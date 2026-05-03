import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

export interface TenantSettings {
  ipWhitelist?: string[];
  [key: string]: unknown;
}

@Injectable()
export class IpWhitelistGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = this.getRequest(context);
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

  /**
   * Extract the request object from either HTTP or GraphQL execution contexts.
   *
   * We avoid importing @nestjs/graphql (not a dependency of this package) and
   * instead manually extract `req` from the GraphQL context argument, which is
   * the third element in the resolver args array: [root, args, context, info].
   */
  private getRequest(context: ExecutionContext): any {
    const contextType = context.getType<string>();
    if (contextType === 'graphql') {
      const gqlArgs = context.getArgs();
      const ctx = gqlArgs[2]; // [root, args, context, info]
      return ctx?.req ?? {};
    }
    return context.switchToHttp().getRequest();
  }
}
