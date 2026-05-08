/**
 * GraphQL operations for the Invoice Factoring product family
 * (Sprint 12 Phase 5A — admin portal).
 *
 * Mirrors the resolver surface in `apps/graphql-server/src/graphql/resolvers/factoring.resolver.ts`
 * and the type/input declarations in `apps/graphql-server/src/graphql/{types,inputs}/factoring.*.ts`.
 *
 * - Six queries (debtors, debtor, debtorRiskAssessment, invoices, invoice, concentrationSummary)
 * - Fifteen mutations (5 debtor, 10 invoice). All mutations accept an `idempotencyKey`.
 *
 * Monetary values are Decimal-as-string; never `Number()` the response payloads.
 */

import { gql } from '@apollo/client';

// ─── Fragments ───────────────────────────────────────────────────────────

export const DEBTOR_FIELDS_FRAGMENT = gql`
  fragment DebtorFields on Debtor {
    id
    tenantId
    companyName
    tradingName
    registrationNumber
    taxId
    country
    industrySector
    contactEmail
    contactPhone
    contactName
    paymentTerms
    averagePaymentDays
    externalCreditRating
    internalRiskScore
    totalExposure
    exposureLimit
    status
    verifiedAt
    createdAt
    updatedAt
  }
`;

export const INVOICE_FIELDS_FRAGMENT = gql`
  fragment InvoiceFields on Invoice {
    id
    tenantId
    sellerId
    debtorId
    productId
    contractId
    invoiceNumber
    issueDate
    dueDate
    faceValue
    currency
    advanceRatePercent
    advancedAmount
    reserveAmount
    discountFee
    serviceFee
    netDisbursement
    status
    verificationStatus
    verifiedBy
    verifiedAt
    verificationNotes
    recourseType
    debtorNotifiedAt
    debtorPaymentRef
    amountReceived
    reserveReleased
    disputeReason
    fundedAt
    settledAt
    defaultedAt
    createdAt
    updatedAt
    # S13-4: nested resolvers — render company / customer name instead of UUIDs.
    debtor {
      id
      companyName
    }
    seller {
      id
      fullName
    }
  }
`;

// ─── Queries ─────────────────────────────────────────────────────────────

export const DEBTORS_QUERY = gql`
  ${DEBTOR_FIELDS_FRAGMENT}
  query Debtors(
    $filters: DebtorFiltersInput
    $pagination: FactoringPaginationInput
  ) {
    debtors(filters: $filters, pagination: $pagination) {
      edges {
        node { ...DebtorFields }
        cursor
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      totalCount
    }
  }
`;

export const DEBTOR_QUERY = gql`
  ${DEBTOR_FIELDS_FRAGMENT}
  query Debtor($debtorId: ID!) {
    debtor(debtorId: $debtorId) {
      ...DebtorFields
    }
  }
`;

export const DEBTOR_RISK_ASSESSMENT_QUERY = gql`
  query DebtorRiskAssessment($debtorId: ID!) {
    debtorRiskAssessment(debtorId: $debtorId) {
      score
      averagePaymentDays
      reliabilityPercent
      factors {
        paymentHistory
        industry
        country
        default
      }
    }
  }
`;

export const INVOICES_QUERY = gql`
  ${INVOICE_FIELDS_FRAGMENT}
  query Invoices(
    $filters: InvoiceFiltersInput
    $pagination: FactoringPaginationInput
  ) {
    invoices(filters: $filters, pagination: $pagination) {
      edges {
        node { ...InvoiceFields }
        cursor
      }
      pageInfo {
        hasNextPage
        hasPreviousPage
        startCursor
        endCursor
      }
      totalCount
    }
  }
`;

export const INVOICE_QUERY = gql`
  ${INVOICE_FIELDS_FRAGMENT}
  query Invoice($invoiceId: ID!) {
    invoice(invoiceId: $invoiceId) {
      ...InvoiceFields
    }
  }
`;

export const CONCENTRATION_SUMMARY_QUERY = gql`
  query ConcentrationSummary {
    concentrationSummary {
      topDebtors {
        debtorId
        companyName
        totalExposure
        percentOfPortfolio
      }
      industryBreakdown {
        industrySector
        totalExposure
        percentOfPortfolio
        debtorCount
      }
      topSellerDebtors {
        sellerId
        debtorId
        totalExposure
        percentOfPortfolio
      }
      limitUtilization {
        type
        max
        current
        utilizationPercent
      }
    }
  }
`;

// ─── Debtor mutations ────────────────────────────────────────────────────

export const CREATE_DEBTOR_MUTATION = gql`
  ${DEBTOR_FIELDS_FRAGMENT}
  mutation CreateDebtor($input: CreateDebtorInput!, $idempotencyKey: String!) {
    createDebtor(input: $input, idempotencyKey: $idempotencyKey) {
      ...DebtorFields
    }
  }
`;

export const UPDATE_DEBTOR_MUTATION = gql`
  ${DEBTOR_FIELDS_FRAGMENT}
  mutation UpdateDebtor(
    $debtorId: ID!
    $input: UpdateDebtorInput!
    $idempotencyKey: String!
  ) {
    updateDebtor(
      debtorId: $debtorId
      input: $input
      idempotencyKey: $idempotencyKey
    ) {
      ...DebtorFields
    }
  }
`;

export const SUSPEND_DEBTOR_MUTATION = gql`
  ${DEBTOR_FIELDS_FRAGMENT}
  mutation SuspendDebtor(
    $debtorId: ID!
    $reason: String!
    $idempotencyKey: String!
  ) {
    suspendDebtor(
      debtorId: $debtorId
      reason: $reason
      idempotencyKey: $idempotencyKey
    ) {
      ...DebtorFields
    }
  }
`;

export const BLACKLIST_DEBTOR_MUTATION = gql`
  ${DEBTOR_FIELDS_FRAGMENT}
  mutation BlacklistDebtor(
    $debtorId: ID!
    $reason: String!
    $idempotencyKey: String!
  ) {
    blacklistDebtor(
      debtorId: $debtorId
      reason: $reason
      idempotencyKey: $idempotencyKey
    ) {
      ...DebtorFields
    }
  }
`;

export const REACTIVATE_DEBTOR_MUTATION = gql`
  ${DEBTOR_FIELDS_FRAGMENT}
  mutation ReactivateDebtor($debtorId: ID!, $idempotencyKey: String!) {
    reactivateDebtor(debtorId: $debtorId, idempotencyKey: $idempotencyKey) {
      ...DebtorFields
    }
  }
`;

// ─── Invoice mutations ───────────────────────────────────────────────────

export const SUBMIT_INVOICE_MUTATION = gql`
  ${INVOICE_FIELDS_FRAGMENT}
  mutation SubmitInvoice($input: SubmitInvoiceInput!) {
    submitInvoice(input: $input) {
      ...InvoiceFields
    }
  }
`;

export const RESOLVE_INVOICE_VERIFICATION_MUTATION = gql`
  ${INVOICE_FIELDS_FRAGMENT}
  mutation ResolveInvoiceVerification(
    $invoiceId: ID!
    $approved: Boolean!
    $idempotencyKey: String!
    $notes: String
  ) {
    resolveInvoiceVerification(
      invoiceId: $invoiceId
      approved: $approved
      idempotencyKey: $idempotencyKey
      notes: $notes
    ) {
      ...InvoiceFields
    }
  }
`;

export const GENERATE_INVOICE_OFFER_MUTATION = gql`
  mutation GenerateInvoiceOffer(
    $invoiceId: ID!
    $idempotencyKey: String!
    $requestedRecourseType: RecourseType
  ) {
    generateInvoiceOffer(
      invoiceId: $invoiceId
      idempotencyKey: $idempotencyKey
      requestedRecourseType: $requestedRecourseType
    ) {
      invoiceId
      faceValue
      advanceRatePercent
      advancedAmount
      reserveAmount
      discountFee
      serviceFee
      netDisbursement
      recourseType
      dueDate
      currency
      expiresAt
    }
  }
`;

export const ACCEPT_INVOICE_OFFER_MUTATION = gql`
  ${INVOICE_FIELDS_FRAGMENT}
  mutation AcceptInvoiceOffer($invoiceId: ID!, $idempotencyKey: String!) {
    acceptInvoiceOffer(invoiceId: $invoiceId, idempotencyKey: $idempotencyKey) {
      ...InvoiceFields
    }
  }
`;

export const DECLINE_INVOICE_OFFER_MUTATION = gql`
  ${INVOICE_FIELDS_FRAGMENT}
  mutation DeclineInvoiceOffer(
    $invoiceId: ID!
    $idempotencyKey: String!
    $reason: String
  ) {
    declineInvoiceOffer(
      invoiceId: $invoiceId
      idempotencyKey: $idempotencyKey
      reason: $reason
    ) {
      ...InvoiceFields
    }
  }
`;

export const DISBURSE_INVOICE_ADVANCE_MUTATION = gql`
  ${INVOICE_FIELDS_FRAGMENT}
  mutation DisburseInvoiceAdvance($invoiceId: ID!, $idempotencyKey: String!) {
    disburseInvoiceAdvance(
      invoiceId: $invoiceId
      idempotencyKey: $idempotencyKey
    ) {
      ...InvoiceFields
    }
  }
`;

export const NOTIFY_INVOICE_DEBTOR_MUTATION = gql`
  ${INVOICE_FIELDS_FRAGMENT}
  mutation NotifyInvoiceDebtor($invoiceId: ID!, $idempotencyKey: String!) {
    notifyInvoiceDebtor(
      invoiceId: $invoiceId
      idempotencyKey: $idempotencyKey
    ) {
      ...InvoiceFields
    }
  }
`;

export const RECORD_INVOICE_DEBTOR_PAYMENT_MUTATION = gql`
  ${INVOICE_FIELDS_FRAGMENT}
  mutation RecordInvoiceDebtorPayment(
    $invoiceId: ID!
    $input: RecordDebtorPaymentInput!
  ) {
    recordInvoiceDebtorPayment(invoiceId: $invoiceId, input: $input) {
      ...InvoiceFields
    }
  }
`;

export const RELEASE_INVOICE_RESERVE_MUTATION = gql`
  ${INVOICE_FIELDS_FRAGMENT}
  mutation ReleaseInvoiceReserve($invoiceId: ID!, $idempotencyKey: String!) {
    releaseInvoiceReserve(
      invoiceId: $invoiceId
      idempotencyKey: $idempotencyKey
    ) {
      ...InvoiceFields
    }
  }
`;

export const DISPUTE_INVOICE_MUTATION = gql`
  ${INVOICE_FIELDS_FRAGMENT}
  mutation DisputeInvoice(
    $invoiceId: ID!
    $reason: String!
    $idempotencyKey: String!
  ) {
    disputeInvoice(
      invoiceId: $invoiceId
      reason: $reason
      idempotencyKey: $idempotencyKey
    ) {
      ...InvoiceFields
    }
  }
`;

// ─── TypeScript shapes ───────────────────────────────────────────────────
// Mirrors `apps/graphql-server/src/graphql/types/factoring.type.ts`.
// Decimal fields are typed as `string` per CLAUDE.md.

export type DebtorStatus =
  | 'active'
  | 'under_review'
  | 'suspended'
  | 'blacklisted';

export type InvoiceStatus =
  | 'submitted'
  | 'under_review'
  | 'verified'
  | 'offer_generated'
  | 'offer_accepted'
  | 'funded'
  | 'debtor_notified'
  | 'payment_received'
  | 'reserve_released'
  | 'settled'
  | 'disputed'
  | 'defaulted'
  | 'cancelled'
  | 'rejected';

export type VerificationStatus =
  | 'pending'
  | 'verified'
  | 'failed'
  | 'waived';

export type RecourseType = 'with_recourse' | 'without_recourse';

export interface IDebtor {
  id: string;
  tenantId: string;
  companyName: string;
  tradingName?: string | null;
  registrationNumber?: string | null;
  taxId?: string | null;
  country: string;
  industrySector?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  contactName?: string | null;
  paymentTerms?: string | null;
  averagePaymentDays?: number | null;
  externalCreditRating?: string | null;
  /** Decimal-as-string in [0, 100]. */
  internalRiskScore?: string | null;
  /** Decimal-as-string. */
  totalExposure: string;
  /** Decimal-as-string. */
  exposureLimit?: string | null;
  status: DebtorStatus;
  verifiedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IInvoice {
  id: string;
  tenantId: string;
  sellerId: string;
  debtorId: string;
  productId: string;
  contractId?: string | null;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  /** Decimal-as-string. */
  faceValue: string;
  currency: string;
  /** Decimal-as-string (percent, 2dp). */
  advanceRatePercent: string;
  /** Decimal-as-string. */
  advancedAmount?: string | null;
  /** Decimal-as-string. */
  reserveAmount?: string | null;
  /** Decimal-as-string. */
  discountFee?: string | null;
  /** Decimal-as-string. */
  serviceFee?: string | null;
  /** Decimal-as-string. */
  netDisbursement?: string | null;
  status: InvoiceStatus;
  verificationStatus: VerificationStatus;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  verificationNotes?: string | null;
  recourseType: RecourseType;
  debtorNotifiedAt?: string | null;
  debtorPaymentRef?: string | null;
  /** Decimal-as-string. */
  amountReceived?: string | null;
  /** Decimal-as-string. */
  reserveReleased?: string | null;
  disputeReason?: string | null;
  fundedAt?: string | null;
  settledAt?: string | null;
  defaultedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  /** S13-4: resolved by GraphQL @ResolveField — nullable until requested. */
  debtor?: { id: string; companyName: string } | null;
  /** S13-4: resolved by GraphQL @ResolveField — the seller is a Customer. */
  seller?: { id: string; fullName?: string | null } | null;
}

export interface IInvoiceOffer {
  invoiceId: string;
  faceValue: string;
  advanceRatePercent: string;
  advancedAmount: string;
  reserveAmount: string;
  discountFee: string;
  serviceFee: string;
  netDisbursement: string;
  recourseType: RecourseType;
  dueDate: string;
  currency: string;
  expiresAt?: string | null;
}

export interface IDebtorRiskFactors {
  paymentHistory: string;
  industry: string;
  country: string;
  default: string;
}

export interface IDebtorRiskResult {
  score: string;
  averagePaymentDays?: number | null;
  reliabilityPercent: string;
  factors: IDebtorRiskFactors;
}

export interface IDebtorExposureRow {
  debtorId: string;
  companyName: string;
  totalExposure: string;
  percentOfPortfolio: string;
}

export interface IIndustryExposureRow {
  industrySector?: string | null;
  totalExposure: string;
  percentOfPortfolio: string;
  debtorCount: number;
}

export interface ISellerDebtorExposureRow {
  sellerId: string;
  debtorId: string;
  totalExposure: string;
  percentOfPortfolio: string;
}

export interface ILimitUtilizationRow {
  type: string;
  max: string;
  current: string;
  utilizationPercent: string;
}

export interface IConcentrationSummary {
  topDebtors: IDebtorExposureRow[];
  industryBreakdown: IIndustryExposureRow[];
  topSellerDebtors: ISellerDebtorExposureRow[];
  limitUtilization: ILimitUtilizationRow[];
}
