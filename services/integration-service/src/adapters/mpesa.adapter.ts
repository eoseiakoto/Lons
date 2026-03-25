import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { IWalletAdapter, TransferParams, TransferResult, CollectionParams, BalanceInfo, TransactionStatusResult } from '@lons/process-engine';

@Injectable()
export class MpesaAdapter implements IWalletAdapter {
  private readonly logger = new Logger('MpesaAdapter');

  async transfer(params: TransferParams): Promise<TransferResult> {
    this.logger.log(`[SANDBOX] M-Pesa B2C: ${params.amount} ${params.currency} to ${params.destination}`);
    const ref = `MPESA-${uuidv4().slice(0, 8).toUpperCase()}`;
    return { success: true, externalRef: ref };
  }

  async collect(params: CollectionParams): Promise<TransferResult> {
    this.logger.log(`[SANDBOX] M-Pesa C2B: ${params.amount} ${params.currency} from ${params.source}`);
    const ref = `MPESA-COL-${uuidv4().slice(0, 8).toUpperCase()}`;
    return { success: true, externalRef: ref };
  }

  async getBalance(walletId: string): Promise<BalanceInfo> {
    this.logger.log(`[SANDBOX] M-Pesa balance for ${walletId}`);
    return { available: '30000.0000', currency: 'KES', lastUpdated: new Date() };
  }

  async getTransactionStatus(reference: string): Promise<TransactionStatusResult> {
    this.logger.log(`[SANDBOX] M-Pesa status for ${reference}`);
    return { reference, status: 'completed', completedAt: new Date() };
  }
}
