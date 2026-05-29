import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '@lons/database';
import {
  EventBusService,
  AuditActionType,
  AuditResourceType,
} from '@lons/common';
import { EventType } from '@lons/event-contracts';

import { AuditService } from '../audit/audit.service';
import { IAuthenticatedUser } from './interfaces/jwt-payload.interface';

/**
 * S19-13 / FR-AUTH-002.3 — central logger for authorisation
 * failures (both resolver/mutation-level and field-level).
 *
 * Three sinks per failure:
 *   1. AuditService.log — durable, hash-chained audit_logs row.
 *   2. EventBusService — AUTHORIZATION_FAILURE event for downstream
 *      monitoring + alerting consumers.
 *   3. Structured logger — PII-masked summary for operator on-call.
 *
 * Monitoring alert: if a single user trips ≥10 auth failures within
 * a 5-minute window, emit MONITORING_ALERT_TRIGGERED so the on-call
 * dashboard surfaces a possible brute-force / privilege-escalation
 * probe.
 *
 * Async: every method is fire-and-forget — auth-guard / interceptor
 * callers don't await this (they throw ForbiddenException immediately).
 * Failures in audit-write are logged but never bubbled up — the
 * authz refusal is the user-visible outcome.
 */
@Injectable()
export class AuthFailureLoggerService {
  private readonly logger = new Logger(AuthFailureLoggerService.name);
  private static readonly ALERT_THRESHOLD = 10;
  private static readonly ALERT_WINDOW_MS = 5 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly auditService?: AuditService,
    @Optional() private readonly eventBus?: EventBusService,
  ) {}

  /**
   * Field-level access denied. Called by FieldAuthInterceptor when
   * a user's permissions fail a rule's requirement.
   */
  async logFieldAccessDenied(
    user: IAuthenticatedUser,
    resourceType: string,
    fieldName: string,
    requiredPermissions: string[],
  ): Promise<void> {
    await this.log({
      tenantId: user.tenantId,
      userId: user.userId,
      userRole: user.role,
      action: 'field_access_denied',
      resourceType,
      resourceField: fieldName,
      requiredPermissions,
      actualPermissions: user.permissions ?? [],
    });
  }

  /**
   * Resolver/mutation-level access denied. Called by AuthGuard /
   * RolesGuard when the requested handler requires a permission the
   * user doesn't hold.
   */
  async logMutationAccessDenied(
    user: IAuthenticatedUser,
    resolverName: string,
    requiredPermission: string,
  ): Promise<void> {
    await this.log({
      tenantId: user.tenantId,
      userId: user.userId,
      userRole: user.role,
      action: 'mutation_access_denied',
      resourceType: 'resolver',
      resourceField: resolverName,
      requiredPermissions: [requiredPermission],
      actualPermissions: user.permissions ?? [],
    });
  }

  /**
   * Common write path. Wrapped in try/catch so a transient
   * audit/event-bus failure can never block the authz refusal.
   */
  private async log(entry: {
    tenantId: string;
    userId: string;
    userRole: string;
    action: string;
    resourceType: string;
    resourceField: string;
    requiredPermissions: string[];
    actualPermissions: string[];
  }): Promise<void> {
    const detail = { ...entry, timestamp: new Date().toISOString() };

    // Sink 1: audit log. Use AuditService when available (preferred —
    // gives us hash-chain integrity); fall back to raw insert.
    try {
      if (this.auditService) {
        await this.auditService.log({
          tenantId: entry.tenantId,
          actorId: entry.userId,
          actorType: 'user',
          action: AuditActionType.READ, // closest existing enum value
          resourceType: AuditResourceType.USER,
          resourceId: entry.userId,
          metadata: detail,
        });
      } else {
        await this.prisma.auditLog.create({
          data: {
            tenantId: entry.tenantId,
            actorId: entry.userId,
            actorType: 'user',
            action: 'authorization_failure',
            resourceType: entry.resourceType,
            resourceId: null,
            metadata: detail as any,
          },
        });
      }
    } catch (err) {
      this.logger.warn(`audit-log write failed (auth failure swallowed): ${(err as Error).message}`);
    }

    // Sink 2: event bus.
    try {
      this.eventBus?.emitAndBuild(EventType.AUTHORIZATION_FAILURE, entry.tenantId, detail);
    } catch (err) {
      this.logger.warn(`auth-failure event emit failed: ${(err as Error).message}`);
    }

    // Sink 3: structured log (PII-masked — no email, no phone).
    this.logger.warn(
      `Auth failure: user=***${entry.userId.slice(-4)} role=${entry.userRole} ` +
        `action=${entry.action} resource=${entry.resourceType}.${entry.resourceField} ` +
        `required=${entry.requiredPermissions.join(',')}`,
    );

    // Monitoring alert on hot-spot brute-force.
    await this.maybeTriggerAlert(entry.tenantId, entry.userId);
  }

  /**
   * If this user has tripped ≥ ALERT_THRESHOLD failures within the
   * trailing ALERT_WINDOW_MS, emit a monitoring alert. The query
   * scans audit_logs — cheap because action+actorId is an indexed
   * combo on the partitioned table.
   */
  private async maybeTriggerAlert(tenantId: string, userId: string): Promise<void> {
    try {
      const windowStart = new Date(Date.now() - AuthFailureLoggerService.ALERT_WINDOW_MS);
      const recentFailures = await this.prisma.auditLog.count({
        where: {
          tenantId,
          actorId: userId,
          action: 'authorization_failure',
          createdAt: { gte: windowStart },
        },
      });
      if (recentFailures >= AuthFailureLoggerService.ALERT_THRESHOLD) {
        // Reuse the AUTHORIZATION_FAILURE event with an alertType
        // marker on the data payload. A separate "alert"-typed event
        // is over-design — monitoring consumers can filter on
        // data.alertType === 'high_auth_failure_rate'.
        this.eventBus?.emitAndBuild(EventType.AUTHORIZATION_FAILURE, tenantId, {
          alertType: 'high_auth_failure_rate',
          userId,
          failureCount: recentFailures,
          windowMinutes: AuthFailureLoggerService.ALERT_WINDOW_MS / 60_000,
        });
        this.logger.error(
          `ALERT: user ***${userId.slice(-4)} tripped ${recentFailures} auth failures in ` +
            `${AuthFailureLoggerService.ALERT_WINDOW_MS / 60_000} minutes — possible brute-force probe`,
        );
      }
    } catch (err) {
      // Audit-log query failure must not block the original auth refusal.
      this.logger.warn(`alert-threshold check failed: ${(err as Error).message}`);
    }
  }
}
