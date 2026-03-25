import Decimal from 'decimal.js';

// Configure Decimal for banker's rounding (round half to even)
Decimal.set({ rounding: Decimal.ROUND_HALF_EVEN, precision: 20 });

export function toDecimal(value: string | number | Decimal): Decimal {
  return new Decimal(value);
}

export function add(a: string, b: string): string {
  return new Decimal(a).plus(new Decimal(b)).toFixed(4);
}

export function subtract(a: string, b: string): string {
  return new Decimal(a).minus(new Decimal(b)).toFixed(4);
}

export function multiply(a: string, b: string): string {
  return new Decimal(a).times(new Decimal(b)).toFixed(4);
}

export function divide(a: string, b: string): string {
  if (new Decimal(b).isZero()) {
    throw new Error('Division by zero');
  }
  return new Decimal(a).dividedBy(new Decimal(b)).toFixed(4);
}

export function bankersRound(value: string, decimalPlaces: number = 4): string {
  return new Decimal(value).toDecimalPlaces(decimalPlaces, Decimal.ROUND_HALF_EVEN).toFixed(decimalPlaces);
}

export function isPositive(value: string): boolean {
  return new Decimal(value).isPositive() && !new Decimal(value).isZero();
}

export function isZero(value: string): boolean {
  return new Decimal(value).isZero();
}

export function isNegative(value: string): boolean {
  return new Decimal(value).isNegative();
}

export function compare(a: string, b: string): number {
  return new Decimal(a).comparedTo(new Decimal(b));
}

export function min(a: string, b: string): string {
  return Decimal.min(new Decimal(a), new Decimal(b)).toFixed(4);
}

export function max(a: string, b: string): string {
  return Decimal.max(new Decimal(a), new Decimal(b)).toFixed(4);
}

export function percentage(amount: string, rate: string): string {
  return new Decimal(amount).times(new Decimal(rate)).dividedBy(100).toFixed(4);
}
