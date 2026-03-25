import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { IWalletAdapter, TransferParams, TransferResult, CollectionParams, BalanceInfo, TransactionStatusResult } from '@lons/process-engine';

@Injectable()
export class MtnMomoAdapter implements IWalletAdapter {
  private readonly logger = new Logger('MtnMomoAdapter');

  async transfer(params: TransferParams): Promise<TransferResult> {
    this.logger.log(`[SANDBOX] MoMo disbursement: ${params.amount} ${params.currency} to ${params.destination}`);
    const ref = `MOMO-${uuidv4().slice(0, 8).toUpperCase()}`;
    return { success: true, externalRef: ref };
  }

  async collect(params: CollectionParams): Promise<TransferResult> {
    this.logger.log(`[SANDBOX] MoMo collection: ${params.amount} ${params.currency} from ${params.source}`);
    const ref = `MOMO-COL-${uuidv4().slice(0, 8).toUpperCase()}`;
    return { success: true, externalRef: ref };
  }

  async getBalance(walletId: string): Promise<BalanceInfo> {
    this.logger.log(`[SANDBOX] MoMo balance query for ${walletId}`);
    return { available: '25000.0000', currency: 'GHS', lastUpdated: new Date() };
  }

  async getTransactionStatus(reference: string): Promise<TransactionStatusResult> {
    this.logger.log(`[SANDBOX] MoMo status query for ${reference}`);
    return { reference, status: 'completed', completedAt: new Date() };
  }
}
