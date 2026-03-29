export interface IWalletCustomerInfo {
  walletId: string;
  fullName: string;
  kycLevel: string;
  accountStatus: string;
  accountAge: number; // days
  currency: string;
}
