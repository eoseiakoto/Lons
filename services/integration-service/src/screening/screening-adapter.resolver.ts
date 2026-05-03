import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IScreeningAdapter } from './screening.interface';
import { MockScreeningAdapter } from './mock-screening.adapter';
import { ComplyAdvantageAdapter } from './complyadvantage.adapter';

/**
 * Factory that resolves the active screening adapter based on the
 * SCREENING_PROVIDER environment variable.
 *
 * Follows the same pattern as WalletAdapterResolver but is simpler:
 * provider selection is global (env var) rather than per-tenant.
 */
@Injectable()
export class ScreeningAdapterResolver {
  private readonly logger = new Logger(ScreeningAdapterResolver.name);
  private adapter: IScreeningAdapter | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly mockAdapter: MockScreeningAdapter,
    private readonly complyAdvantageAdapter: ComplyAdvantageAdapter,
  ) {}

  resolve(): IScreeningAdapter {
    if (this.adapter) {
      return this.adapter;
    }

    const provider = this.configService.get<string>('SCREENING_PROVIDER', 'mock').toLowerCase();

    switch (provider) {
      case 'complyadvantage':
        this.logger.log('Using ComplyAdvantage screening adapter');
        this.adapter = this.complyAdvantageAdapter;
        break;
      case 'mock':
      default:
        this.logger.log('Using Mock screening adapter');
        this.adapter = this.mockAdapter;
        break;
    }

    return this.adapter;
  }

  getProviderName(): string {
    return this.resolve().getProviderName();
  }
}
