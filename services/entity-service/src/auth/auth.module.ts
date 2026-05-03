import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { AuthService } from './auth.service';
import { JwtService } from './jwt.service';
import { PasswordService } from './password.service';
import { AuthGuard } from './guards/auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { RlsTenantContextInterceptor } from './interceptors/rls-tenant-context.interceptor';

@Module({
  imports: [ConfigModule],
  providers: [
    AuthService,
    JwtService,
    PasswordService,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    // RLS interceptor MUST run after AuthGuard so request.user is populated.
    // NestJS runs APP_INTERCEPTORs after APP_GUARDs by design.
    {
      provide: APP_INTERCEPTOR,
      useClass: RlsTenantContextInterceptor,
    },
  ],
  exports: [AuthService, JwtService, PasswordService],
})
export class AuthModule {}
