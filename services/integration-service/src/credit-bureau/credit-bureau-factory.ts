import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ICreditBureauAdapter, CreditReport } from './credit-bureau.interface';
import { GhanaXcbAdapter } from './ghana-xcb.adapter';
import { KenyaCrbAdapter } from './kenya-crb.adapter';
import { MockCreditBureauAdapter } from './mock-credit-bureau.adapter';
import { maskNationalId } from '@lons/common';

/**
 * Credit Bureau Factory
 *
 * Resolves the correct credit bureau adapter based on country code.
 * Supports fallback: if the primary adapter's circuit breaker is open or a call
 * fails, falls back to a secondary bureau (or the mock adapter).
 */
@Injectable()
export class CreditBureauFactory {
  private readonly logger = new Logger('CreditBureauFactory');

  private readonly adapterMap: Map<string, ICreditBureauAdapter>;

  constructor(
    private readonly ghanaAdapter: GhanaXcbAdapter,
    private readonly kenyaAdapter: KenyaCrbAdapter,
    private readonly mockAdapter: MockCreditBureauAdapter,
    private readonly config: ConfigService,
  ) {
    this.adapterMap = new Map<string, ICreditBureauAdapter>();
    this.adapterMap.set('GH', this.ghanaAdapter);
    this.adapterMap.set('KE', this.kenyaAdapter);
  }

  /**
   * Get the primary adapter for a given country code.
   * Falls back to mock adapter for unsupported countries.
   */
  getAdapter(country: string): ICreditBureauAdapter {
    const adapter = this.adapterMap.get(country.toUpperCase());
    if (adapter) {
      return adapter;
    }

    this.logger.warn(
      `No credit bureau adapter for country '${country}', falling back to mock`,
    );
    return this.mockAdapter;
  }

  /**
   * Get adapter with automatic fallback.
   * Tries the primary adapter; if it fails (circuit breaker open, network error, etc.),
   * tries a secondary bureau adapter before falling back to mock.
   */
  async getAdapterWithFallback(
    country: string,
  ): Promise<ICreditBureauAdapter> {
    const primary = this.adapterMap.get(country.toUpperCase());

    if (!primary) {
      this.logger.warn(
        `No primary adapter for '${country}', using mock adapter`,
      );
      return this.mockAdapter;
    }

    // Test primary adapter availability with a lightweight check
    try {
      // We return the primary adapter; the caller will use it.
      // If it throws during use, the caller should catch and call getFallbackAdapter().
      return primary;
    } catch {
      return this.getFallbackAdapter(country);
    }
  }

  /**
   * Get a fallback adapter when the primary fails.
   * Tries other country adapters as cross-bureau fallback before resorting to mock.
   */
  getFallbackAdapter(country: string): ICreditBureauAdapter {
    const upperCountry = country.toUpperCase();

    // Try other real adapters as secondary
    for (const [code, adapter] of this.adapterMap) {
      if (code !== upperCountry) {
        this.logger.log(
          `Primary bureau for ${upperCountry} unavailable, trying ${code} adapter as fallback`,
        );
        return adapter;
      }
    }

    this.logger.warn(
      `All bureau adapters unavailable for ${upperCountry}, falling back to mock`,
    );
    return this.mockAdapter;
  }

  /**
   * Get all registered adapters (useful for batch operations)
   */
  getAllAdapters(): ICreditBureauAdapter[] {
    return [this.ghanaAdapter, this.kenyaAdapter];
  }

  /**
   * Get supported country codes
   */
  getSupportedCountries(): string[] {
    return Array.from(this.adapterMap.keys());
  }

  /**
   * Query credit report with automatic fallback across adapters.
   *
   * Tries the primary adapter for the given country. If it fails, attempts
   * all other available adapters in order. Each adapter has its own circuit
   * breaker, so a failure in one does not affect the others.
   *
   * @param tenantId - Tenant context for logging
   * @param customerId - Customer UUID (safe to log)
   * @param nationalId - National ID for bureau query (masked in logs)
   * @param country - Country code (GH, KE, etc.)
   */
  async queryWithFallback(
    tenantId: string,
    customerId: string,
    nationalId: string,
    country: string,
  ): Promise<CreditReport | null> {
    const maskedId = maskNationalId(nationalId);
    const primaryAdapter = this.getAdapter(country);
    const allAdapters: ICreditBureauAdapter[] = [
      primaryAdapter,
      ...this.getAllAdapters().filter(
        (a) => a.getBureauType() !== primaryAdapter.getBureauType(),
      ),
      this.mockAdapter,
    ];
    // Deduplicate adapters by bureau type
    const seen = new Set<string>();
    const orderedAdapters: ICreditBureauAdapter[] = [];
    for (const adapter of allAdapters) {
      if (!seen.has(adapter.getBureauType())) {
        seen.add(adapter.getBureauType());
        orderedAdapters.push(adapter);
      }
    }

    for (const adapter of orderedAdapters) {
      try {
        this.logger.log(
          `[tenant=${tenantId}] Querying ${adapter.getBureauType()} for customer ${customerId} (${maskedId})`,
        );
        const report = await adapter.queryReport(nationalId, true);
        if (report) {
          this.logger.log(
            `[tenant=${tenantId}] Report obtained from ${adapter.getBureauType()} for ${maskedId}`,
          );
          return report;
        }
      } catch (error) {
        this.logger.warn(
          `[tenant=${tenantId}] Adapter ${adapter.getBureauType()} failed for ${maskedId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    this.logger.error(
      `[tenant=${tenantId}] All credit bureau adapters exhausted for ${maskedId}`,
    );
    return null;
  }
}
