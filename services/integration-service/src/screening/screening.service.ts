import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@lons/database';
import { EventBusService } from '@lons/common';
import { EventType } from '@lons/event-contracts';
import { ConfigService } from '@nestjs/config';

import { ScreeningAdapterResolver } from './screening-adapter.resolver';
import { IScreeningResult } from './screening.interface';

@Injectable()
export class ScreeningService {
  private readonly logger = new Logger(ScreeningService.name);
  private readonly cacheTtlHours: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly adapterResolver: ScreeningAdapterResolver,
    private readonly configService: ConfigService,
  ) {
    this.cacheTtlHours = parseInt(
      this.configService.get<string>('SCREENING_CACHE_TTL_HOURS', '24'),
      10,
    );
  }

  /**
   * Screen a customer. Returns a cached CLEAR result if one exists
   * within the TTL window; otherwise initiates a new screening.
   */
  async screenCustomer(
    tenantId: string,
    customerId: string,
  ): Promise<IScreeningResult> {
    // Check for a recent CLEAR result within the cache TTL
    const cached = await this.getCachedClearResult(tenantId, customerId);
    if (cached) {
      this.logger.log(`Cache hit: recent CLEAR screening for customer ${customerId}`);
      return cached;
    }

    // Load customer details from the database
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId, deletedAt: null },
    });

    if (!customer) {
      throw new NotFoundException(`Customer ${customerId} not found`);
    }

    const adapter = this.adapterResolver.resolve();

    // Emit screening initiated event
    this.eventBus.emitAndBuild(EventType.SCREENING_INITIATED, tenantId, {
      customerId,
      provider: adapter.getProviderName(),
    });

    // Perform the screening
    const result = await adapter.screenCustomer({
      customerId,
      tenantId,
      fullName: customer.fullName ?? customer.externalId,
      dateOfBirth: customer.dateOfBirth?.toISOString(),
      nationalId: customer.nationalId ?? undefined,
      country: customer.country ?? 'GH',
    });

    // Store the result in the database
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + this.cacheTtlHours);

    const stored = await this.prisma.screeningResult.create({
      data: {
        tenantId,
        customerId,
        externalId: result.screeningId,
        provider: result.provider,
        status: result.status,
        riskLevel: result.riskLevel,
        matchCount: result.matches.length,
        matchDetails: result.matches as any,
        rawResponse: result.rawResponse
          ? Buffer.from(JSON.stringify(result.rawResponse))
          : null,
        screenedAt: result.screenedAt,
        expiresAt,
      },
    });

    // Emit the appropriate event based on result status
    this.emitResultEvent(tenantId, customerId, result, stored.id);

    return {
      ...result,
      screeningId: stored.id,
    };
  }

  /**
   * Return the most recent screening result for a customer.
   */
  async getLatestScreening(
    tenantId: string,
    customerId: string,
  ): Promise<IScreeningResult | null> {
    const record = await this.prisma.screeningResult.findFirst({
      where: { tenantId, customerId },
      orderBy: { screenedAt: 'desc' },
    });

    if (!record) return null;

    return this.mapDbToResult(record);
  }

  /**
   * Return all screening history for a customer.
   */
  async getScreeningHistory(
    tenantId: string,
    customerId: string,
    take = 20,
  ): Promise<IScreeningResult[]> {
    const records = await this.prisma.screeningResult.findMany({
      where: { tenantId, customerId },
      orderBy: { screenedAt: 'desc' },
      take,
    });

    return records.map((r) => this.mapDbToResult(r));
  }

  /**
   * Return POTENTIAL_MATCH screenings that have not been reviewed.
   */
  async getScreeningsForReview(
    tenantId: string,
    take = 50,
  ): Promise<IScreeningResult[]> {
    const records = await this.prisma.screeningResult.findMany({
      where: {
        tenantId,
        status: 'POTENTIAL_MATCH',
        reviewedAt: null,
      },
      include: { customer: true },
      orderBy: { screenedAt: 'desc' },
      take,
    });

    return records.map((r) => this.mapDbToResult(r));
  }

  /**
   * Return a single screening by ID, with customer data included.
   */
  async getScreeningById(
    tenantId: string,
    screeningId: string,
  ): Promise<IScreeningResult | null> {
    const record = await this.prisma.screeningResult.findFirst({
      where: { id: screeningId, tenantId },
      include: { customer: true },
    });

    if (!record) return null;

    return this.mapDbToResult(record);
  }

  /**
   * Submit a manual review decision for a screening.
   */
  async submitReview(
    tenantId: string,
    screeningId: string,
    decision: string,
    reviewedBy: string,
    reason?: string,
  ): Promise<IScreeningResult> {
    const record = await this.prisma.screeningResult.findFirst({
      where: { id: screeningId, tenantId },
    });

    if (!record) {
      throw new NotFoundException(`Screening result ${screeningId} not found`);
    }

    const updated = await this.prisma.screeningResult.update({
      where: { id: screeningId },
      data: {
        reviewedBy,
        reviewedAt: new Date(),
        reviewDecision: decision,
      },
    });

    this.eventBus.emitAndBuild(
      EventType.SCREENING_MANUAL_REVIEW_COMPLETED,
      tenantId,
      {
        screeningId,
        customerId: record.customerId,
        decision,
        reviewedBy,
      },
    );

    return this.mapDbToResult(updated);
  }

  // ── Private helpers ──────────────────────────────────────────────────

  private async getCachedClearResult(
    tenantId: string,
    customerId: string,
  ): Promise<IScreeningResult | null> {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - this.cacheTtlHours);

    const recent = await this.prisma.screeningResult.findFirst({
      where: {
        tenantId,
        customerId,
        status: 'CLEAR',
        screenedAt: { gte: cutoff },
      },
      orderBy: { screenedAt: 'desc' },
    });

    if (!recent) return null;

    return this.mapDbToResult(recent);
  }

  private emitResultEvent(
    tenantId: string,
    customerId: string,
    result: IScreeningResult,
    storedId: string,
  ): void {
    const eventData = {
      screeningId: storedId,
      customerId,
      status: result.status,
      riskLevel: result.riskLevel,
      matchCount: result.matches.length,
      provider: result.provider,
    };

    switch (result.status) {
      case 'CLEAR':
        this.eventBus.emitAndBuild(EventType.SCREENING_CLEAR, tenantId, eventData);
        break;
      case 'MATCH':
        this.eventBus.emitAndBuild(EventType.SCREENING_MATCH_FOUND, tenantId, eventData);
        break;
      case 'POTENTIAL_MATCH':
        this.eventBus.emitAndBuild(EventType.SCREENING_POTENTIAL_MATCH, tenantId, eventData);
        this.eventBus.emitAndBuild(EventType.SCREENING_MANUAL_REVIEW_REQUIRED, tenantId, eventData);
        break;
      case 'ERROR':
        this.eventBus.emitAndBuild(EventType.SCREENING_ERROR, tenantId, eventData);
        break;
    }
  }

  private mapDbToResult(record: any): IScreeningResult {
    return {
      customerId: record.customerId,
      tenantId: record.tenantId,
      screeningId: record.id,
      status: record.status,
      riskLevel: record.riskLevel,
      matches: (record.matchDetails as any[]) ?? [],
      provider: record.provider,
      screenedAt: record.screenedAt,
      rawResponse: record.rawResponse
        ? JSON.parse(Buffer.from(record.rawResponse).toString('utf-8'))
        : undefined,
      reviewedBy: record.reviewedBy ?? undefined,
      reviewedAt: record.reviewedAt ?? undefined,
      reviewDecision: record.reviewDecision ?? undefined,
      customer: record.customer
        ? {
            id: record.customer.id,
            fullName: record.customer.fullName,
            phonePrimary: record.customer.phonePrimary,
            externalId: record.customer.externalId,
            country: record.customer.country,
            kycLevel: record.customer.kycLevel,
            status: record.customer.status,
          }
        : undefined,
    };
  }
}
