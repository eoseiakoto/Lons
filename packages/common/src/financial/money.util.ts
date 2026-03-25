import { IMoney } from '@lons/shared-types';
import { add, subtract, multiply, compare, isPositive, isZero, isNegative, bankersRound, percentage } from './decimal.util';

export function createMoney(amount: string, currency: string): IMoney {
  return { amount: bankersRound(amount), currency };
}

export function addMoney(a: IMoney, b: IMoney): IMoney {
  assertSameCurrency(a, b);
  return { amount: add(a.amount, b.amount), currency: a.currency };
}

export function subtractMoney(a: IMoney, b: IMoney): IMoney {
  assertSameCurrency(a, b);
  return { amount: subtract(a.amount, b.amount), currency: a.currency };
}

export function multiplyMoney(money: IMoney, factor: string): IMoney {
  return { amount: multiply(money.amount, factor), currency: money.currency };
}

export function compareMoney(a: IMoney, b: IMoney): number {
  assertSameCurrency(a, b);
  return compare(a.amount, b.amount);
}

export function isMoneyPositive(money: IMoney): boolean {
  return isPositive(money.amount);
}

export function isMoneyZero(money: IMoney): boolean {
  return isZero(money.amount);
}

export function isMoneyNegative(money: IMoney): boolean {
  return isNegative(money.amount);
}

export function percentageOfMoney(money: IMoney, rate: string): IMoney {
  return { amount: percentage(money.amount, rate), currency: money.currency };
}

export function zeroMoney(currency: string): IMoney {
  return { amount: '0.0000', currency };
}

function assertSameCurrency(a: IMoney, b: IMoney): void {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}
