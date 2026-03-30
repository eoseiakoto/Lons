// ---------------------------------------------------------------------------
// Shared test data generation helpers for k6 load tests
// ---------------------------------------------------------------------------

import { randomIntBetween, randomString } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

/**
 * Generate a random customer for Ghana (+233)
 */
export function generateGhanaianCustomer() {
  const firstName = randomString(8);
  const lastName = randomString(8);
  // Ghana: +233 XXX XXX XXXX (10 digits after country code)
  const phoneNumber = `+233${randomIntBetween(100000000, 999999999)}`;
  const nationalId = `GHA-${randomString(3).toUpperCase()}-${randomIntBetween(100000, 999999)}`;

  return {
    firstName,
    lastName,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@test.com`,
    phoneNumber,
    nationalId,
    dateOfBirth: `198${randomIntBetween(0, 9)}-${randomIntBetween(1, 12)
      .toString()
      .padStart(2, '0')}-${randomIntBetween(1, 28)
      .toString()
      .padStart(2, '0')}`,
    country: 'GH',
    city: 'Accra',
    address: `${randomIntBetween(1, 999)} Main Street`,
    occupation: 'Trader',
  };
}

/**
 * Generate a random customer for Kenya (+254)
 */
export function generateKenyanCustomer() {
  const firstName = randomString(8);
  const lastName = randomString(8);
  // Kenya: +254 XXX XXX XXX (9 digits after country code)
  const phoneNumber = `+254${randomIntBetween(100000000, 999999999)}`;
  const nationalId = `KEN-${randomString(3).toUpperCase()}-${randomIntBetween(100000, 999999)}`;

  return {
    firstName,
    lastName,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@test.com`,
    phoneNumber,
    nationalId,
    dateOfBirth: `198${randomIntBetween(0, 9)}-${randomIntBetween(1, 12)
      .toString()
      .padStart(2, '0')}-${randomIntBetween(1, 28)
      .toString()
      .padStart(2, '0')}`,
    country: 'KE',
    city: 'Nairobi',
    address: `${randomIntBetween(1, 999)} Kenyatta Avenue`,
    occupation: 'Entrepreneur',
  };
}

/**
 * Generate a random customer for Nigeria (+234)
 */
export function generateNigerianCustomer() {
  const firstName = randomString(8);
  const lastName = randomString(8);
  // Nigeria: +234 XXX XXX XXXX (10 digits after country code)
  const phoneNumber = `+234${randomIntBetween(800000000, 999999999)}`;
  const nationalId = `NGA-${randomString(3).toUpperCase()}-${randomIntBetween(100000, 999999)}`;

  return {
    firstName,
    lastName,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@test.com`,
    phoneNumber,
    nationalId,
    dateOfBirth: `198${randomIntBetween(0, 9)}-${randomIntBetween(1, 12)
      .toString()
      .padStart(2, '0')}-${randomIntBetween(1, 28)
      .toString()
      .padStart(2, '0')}`,
    country: 'NG',
    city: 'Lagos',
    address: `${randomIntBetween(1, 999)} Lekki Road`,
    occupation: 'Professional',
  };
}

/**
 * Generate a random loan request payload
 *
 * @param {string} productType - One of: overdraft, microloan, bnpl, factoring
 * @returns {object} Loan request payload
 */
export function generateLoanRequest(productType) {
  const amounts = {
    overdraft: { min: 500, max: 5000 },
    microloan: { min: 1000, max: 10000 },
    bnpl: { min: 2000, max: 50000 },
    factoring: { min: 10000, max: 100000 },
  };

  const range = amounts[productType] || amounts.microloan;
  const amount = randomIntBetween(range.min, range.max);

  return {
    productType,
    amount: amount.toString(),
    currency: 'GHS',
    duration: productType === 'factoring' ? 30 : randomIntBetween(7, 180),
    purpose: `Loan for ${productType}`,
    repaymentFrequency: productType === 'overdraft' ? 'monthly' : 'biweekly',
  };
}

/**
 * Generate a repayment payload
 *
 * @param {string} type - One of: full, partial, early_settlement, penalty
 * @param {number} outstandingAmount - Current outstanding balance
 * @returns {object} Repayment payload
 */
export function generateRepaymentPayload(type, outstandingAmount) {
  const amount = parseFloat(outstandingAmount);

  let paymentAmount;
  switch (type) {
    case 'full':
      paymentAmount = amount;
      break;
    case 'partial':
      paymentAmount = amount * 0.5;
      break;
    case 'early_settlement':
      paymentAmount = amount * 1.02; // 2% early settlement fee included
      break;
    case 'penalty':
      paymentAmount = amount * 0.15; // Partial payment + penalties
      break;
    default:
      paymentAmount = amount;
  }

  return {
    contractId: '',
    amount: paymentAmount.toFixed(2),
    currency: 'GHS',
    method: ['momo', 'bank_transfer', 'cash'][randomIntBetween(0, 2)],
    reference: `REF-${randomString(12).toUpperCase()}`,
    notes: `${type} payment`,
  };
}

/**
 * Generate GraphQL query parameters
 */
export const GRAPHQL_QUERIES = {
  customerSearch: (tenantId, skip = 0, first = 25) => `
    query {
      customers(tenantId: "${tenantId}", first: ${first}, after: "") {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id
            firstName
            lastName
            email
            phoneNumber
          }
        }
      }
    }
  `,

  loanList: (tenantId, skip = 0, first = 25) => `
    query {
      contracts(tenantId: "${tenantId}", first: ${first}, after: "") {
        totalCount
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id
            customerId
            productType
            status
            principalAmount
            outstandingAmount
            createdAt
          }
        }
      }
    }
  `,

  contractDetail: (contractId) => `
    query {
      contract(id: "${contractId}") {
        id
        customerId
        productType
        status
        principalAmount
        outstandingAmount
        interestRate
        disbursedAt
        scheduledMaturityDate
        createdAt
      }
    }
  `,

  dashboardMetrics: (tenantId) => `
    query {
      dashboardMetrics(tenantId: "${tenantId}") {
        totalCustomers
        activeContracts
        totalDisbursed
        totalRepaid
        outstandingPortfolio
        averageLoLTV
        delinquencyRate
      }
    }
  `,

  repaymentSchedule: (contractId) => `
    query {
      repaymentSchedule(contractId: "${contractId}") {
        totalInstallments
        paidInstallments
        nextDueDate
        nextDueAmount
        installments {
          dueDate
          principalAmount
          interestAmount
          feeAmount
          totalDue
          paidAmount
          status
        }
      }
    }
  `,
};

/**
 * Generate GraphQL mutation for creating a loan request
 */
export function generateCreateLoanRequestMutation(customerId, productType) {
  const request = generateLoanRequest(productType);
  return `
    mutation {
      createLoanRequest(input: {
        customerId: "${customerId}"
        productType: ${productType.toUpperCase()}
        amount: "${request.amount}"
        currency: "${request.currency}"
        duration: ${request.duration}
        purpose: "${request.purpose}"
        repaymentFrequency: ${request.repaymentFrequency.toUpperCase()}
      }) {
        id
        status
        customerId
        createdAt
      }
    }
  `;
}

/**
 * Generate GraphQL mutation for accepting an offer
 */
export function generateAcceptOfferMutation(offerId) {
  return `
    mutation {
      acceptOffer(id: "${offerId}") {
        id
        status
        contractId
        acceptedAt
      }
    }
  `;
}
