import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { AuthService } from './auth.service';
import { JwtService } from './jwt.service';
import { PasswordService } from './password.service';
import { MfaService } from './mfa.service';
import { MfaComplianceService } from './mfa-compliance.service';
import { FieldAuthService } from './field-auth.service';
import { AuthFailureLoggerService } from './auth-failure-logger.service';
import { AuthGuard } from './guards/auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { RlsTenantContextInterceptor } from './interceptors/rls-tenant-context.interceptor';
import { FieldAuthInterceptor } from './interceptors/field-auth.interceptor';

@Module({
  imports: [ConfigModule],
  providers: [
    AuthService,
    JwtService,
    PasswordService,
    // Sprint 15 (S15-6) — MFA TOTP enrollment + verification.
    MfaService,
    // S19-STAB-5 — tier-based MFA enforcement compliance check.
    MfaComplianceService,
    // S19-12 — field-level authorisation rule loader + interceptor.
    // Service is exported for tests + admin-config writes; the
    // interceptor is opt-in per-resolver via @UseInterceptors +
    // @FieldAuthResource('<resource-type>'), so it doesn't impose
    // overhead on resolvers that don't need it.
    FieldAuthService,
    FieldAuthInterceptor,
    // S19-13 — central auth-failure logger. Used by AuthGuard +
    // RolesGuard + FieldAuthInterceptor to capture access denials
    // to audit_logs + emit AUTHORIZATION_FAILURE + warn on high-rate
    // bursts. Optional deps (AuditService, EventBusService) so tests
    // can construct without wiring everything.
    AuthFailureLoggerService,
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
  exports: [
    AuthService,
    JwtService,
    PasswordService,
    MfaService,
    MfaComplianceService,
    FieldAuthService,
    FieldAuthInterceptor,
    AuthFailureLoggerService,
  ],
})
export class AuthModule {}
