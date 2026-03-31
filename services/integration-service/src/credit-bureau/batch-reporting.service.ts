import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@lons/database';
import { CreditBureauFactory } from './credit-bureau-factory';
import { BatchReportRecord, BatchReportResult } from './credit-bureau.interface';

/**
 * Batch Reporting Service
 *
 * Collects recent loan lifecycle events (originations, repayments, defaults, closures)
 * and submits them in batch to the appropriate credit bureau adapter.
 */
@Injectable()
export class BatchReportingService {
  private readonly logger = new Logger('BatchReportingService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly bureauFactory: CreditBureauFactory,
  ) {}

  /**
   * Generate a batch report of loan events since the given date for a tenant.
   * Collects new originations, repayment updates, defaults, and closures.
   */
  async generateBatchReport(
    tenantId: string,
    since: Date,
  ): Promise<BatchReportRecord[]> {
    this.logger.log(
      `Generating batch report for tenant ${tenantId} since ${since.toISOString()}`,
    );

    const records: BatchReportRecord[] = [];

    // Collect new originations (contracts created since the date)
    const newContracts = await this.prisma.contract.findMany({
      where: {
        tenantId,
        createdAt: { gte: since },
      },
      include: {
        customer: { select: { nationalId: true } },
        product: { select: { currency: true } },
      },
    });

    for (const contract of newContracts) {
      records.push({
        customerId: contract.customerId,
        contractId: contract.id,
        nationalId: contract.customer?.nationalId || '',
        amount: String(contract.principalAmount),
        currency: contract.product?.currency || 'GHS',
        type: 'origination',
        status: String(contract.status),
        eventDate: contract.createdAt,
      });
    }

    // Collect repayments since the date
    const recentRepayments = await this.prisma.repayment.findMany({
      where: {
        tenantId,
        createdAt: { gte: since },
      },
      include: {
        contract: {
          include: {
            customer: { select: { nationalId: true } },
            product: { select: { currency: true } },
          },
        },
      },
    });

    for (const repayment of recentRepayments) {
      records.push({
        customerId: repayment.contract?.customerId || '',
        contractId: repayment.contractId,
        nationalId: repayment.contract?.customer?.nationalId || '',
        amount: String(repayment.amount),
        currency: repayment.contract?.product?.currency || 'GHS',
        type: 'repayment',
        status: String(repayment.status),
        eventDate: repayment.createdAt,
      });
    }

    // Collect defaults (contracts that entered default status since the date)
    const defaultedContracts = await this.prisma.contract.findMany({
      where: {
        tenantId,
        status: 'default_status',
        updatedAt: { gte: since },
      },
      include: {
        customer: { select: { nationalId: true } },
        product: { select: { currency: true } },
      },
    });

    for (const contract of defaultedContracts) {
      records.push({
        customerId: contract.customerId,
        contractId: contract.id,
        nationalId: contract.customer?.nationalId || '',
        amount: String(contract.totalOutstanding),
        currency: contract.product?.currency || 'GHS',
        type: 'default',
        status: 'default',
        reason: 'Payment default',
        eventDate: contract.updatedAt,
      });
    }

    // Collect closures (settled/closed contracts since the date)
    const closedContracts = await this.prisma.contract.findMany({
      where: {
        tenantId,
        status: { in: ['settled', 'cancelled'] },
        updatedAt: { gte: since },
      },
      include: {
        customer: { select: { nationalId: true } },
        product: { select: { currency: true } },
      },
    });

    for (const contract of closedContracts) {
      records.push({
        customerId: contract.customerId,
        contractId: contract.id,
        nationalId: contract.customer?.nationalId || '',
        amount: String(contract.principalAmount),
        currency: contract.product?.currency || 'GHS',
        type: 'closure',
        status: String(contract.status),
        eventDate: contract.updatedAt,
      });
    }

    this.logger.log(
      `Batch report generated: ${records.length} records (${newContracts.length} originations, ${recentRepayments.length} repayments, ${defaultedContracts.length} defaults, ${closedContracts.length} closures)`,
    );

    return records;
  }

  /**
   * Submit a batch of records to the appropriate credit bureau adapter.
   */
  async submitBatch(
    tenantId: string,
    country: string,
    records?: BatchReportRecord[],
    since?: Date,
  ): Promise<BatchReportResult> {
    const batchRecords =
      records || (await this.generateBatchReport(tenantId, since || this.getDefaultSinceDate()));

    const adapter = this.bureauFactory.getAdapter(country);
    const result: BatchReportResult = {
      totalRecords: batchRecords.length,
      successCount: 0,
      failureCount: 0,
      errors: [],
    };

    this.logger.log(
      `Submitting batch of ${batchRecords.length} records to ${country} bureau`,
    );

    for (let i = 0; i < batchRecords.length; i++) {
      const record = batchRecords[i];

      try {
        if (record.type === 'default') {
          await adapter.submitNegativeData({
            customerId: record.customerId,
            contractId: record.contractId,
            amount: record.amount,
            reason: record.reason || 'Payment default',
          });
        } else {
          await adapter.submitPositiveData({
            customerId: record.customerId,
            contractId: record.contractId,
            amount: record.amount,
            status: `${record.type}:${record.status}`,
          });
        }

        result.successCount++;
      } catch (error) {
        result.failureCount++;
        result.errors.push({
          recordIndex: i,
          error: error instanceof Error ? error.message : String(error),
        });

        this.logger.error(
          `Batch submit failed for record ${i} (contract ${record.contractId}): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.logger.log(
      `Batch submission complete: ${result.successCount}/${result.totalRecords} succeeded, ${result.failureCount} failed`,
    );

    return result;
  }

  /**
   * Scheduled daily batch reporting job.
   * Runs at 2:00 AM every day. Queries all tenants with active contracts
   * and submits batch reports to the appropriate bureau per country.
   */
  @Cron('0 2 * * *', { name: 'credit-bureau-batch-report' })
  async handleScheduledBatchReport(): Promise<void> {
    this.logger.log('Starting scheduled credit bureau batch report...');
    const since = this.getDefaultSinceDate();

    try {
      // Get distinct tenants with recent contract activity
      const activeTenants = await this.prisma.contract.findMany({
        where: { updatedAt: { gte: since } },
        select: { tenantId: true },
        distinct: ['tenantId'],
      });

      const supportedCountries = this.bureauFactory.getSupportedCountries();

      for (const { tenantId } of activeTenants) {
        for (const country of supportedCountries) {
          try {
            const records = await this.generateBatchReport(tenantId, since);
            if (records.length > 0) {
              const result = await this.submitBatch(tenantId, country, records);
              this.logger.log(
                `[tenant=${tenantId}][${country}] Batch report: ${result.successCount}/${result.totalRecords} succeeded`,
              );
            }
          } catch (error) {
            this.logger.error(
              `[tenant=${tenantId}][${country}] Scheduled batch report failed: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }

      this.logger.log('Scheduled credit bureau batch report complete.');
    } catch (error) {
      this.logger.error(
        `Scheduled batch report failed globally: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Default lookback window: 24 hours
   */
  private getDefaultSinceDate(): Date {
    const date = new Date();
    date.setHours(date.getHours() - 24);
    return date;
  }
}
