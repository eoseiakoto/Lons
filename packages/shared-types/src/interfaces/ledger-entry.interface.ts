import { LedgerEntryType, DebitCredit } from '../enums';
import { ITenantScoped } from './common.interface';

export interface ILedgerEntry extends ITenantScoped {
  id: string;
  contractId: string;
  entryType: LedgerEntryType;
  debitCredit: DebitCredit;
  amount: string;
  currency: string;
  runningBalance: string;
  effectiveDate: Date;
  valueDate: Date;
  description?: string;
  referenceType?: string;
  referenceId?: string;
  createdAt: Date;
}
