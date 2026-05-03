/**
 * BigInt-backed Decimal helpers for the admin portal (Sprint 11 Track B
 * FIX 2). Mirrors the @lons/common Decimal API but doesn't pull the
 * NestJS server runtime into the browser bundle.
 *
 * All operands are decimal strings; all results are normalized to 4
 * fractional digits (matching `Prisma.Decimal(19, 4)` storage).
 *
 * **Never** use `parseFloat`/`Number()` on monetary amounts — these
 * helpers exist so we don't.
 */

// `target: ES2017` in tsconfig.json blocks `100n` literal syntax, so we
// build BigInts via the constructor.
const SCALE = BigInt(10000); // 4 decimal places
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const TEN = BigInt(10);

/** Parse a decimal string into scaled bigint units (4dp). */
function toUnits(value: string): bigint {
  const trimmed = value.trim();
  const negative = trimmed.startsWith('-');
  const abs = negative ? trimmed.slice(1) : trimmed;
  const [intPart, fracPart = ''] = abs.split('.');
  const intBig = BigInt(intPart || '0');
  const fracPadded = (fracPart + '0000').slice(0, 4);
  const fracBig = BigInt(fracPadded || '0');
  const sum = intBig * SCALE + fracBig;
  return negative ? -sum : sum;
}

function fromUnits(units: bigint): string {
  const negative = units < ZERO;
  const abs = negative ? -units : units;
  const intOut = abs / SCALE;
  const fracOut = (abs % SCALE).toString().padStart(4, '0');
  return `${negative ? '-' : ''}${intOut}.${fracOut}`;
}

/** Add two decimal strings. Result is 4dp normalized. */
export function add(a: string, b: string): string {
  return fromUnits(toUnits(a) + toUnits(b));
}

/** Subtract `b` from `a`. */
export function subtract(a: string, b: string): string {
  return fromUnits(toUnits(a) - toUnits(b));
}

/** Multiply two decimals. Result is 4dp normalized. */
export function multiply(a: string, b: string): string {
  // a × b at 4dp: (aUnits × bUnits) / SCALE, banker-rounded at 4dp.
  const product = toUnits(a) * toUnits(b);
  return fromUnits(bankerRoundBigint(product, SCALE));
}

/** Divide `a` by `b`. Throws on zero. Result is 4dp banker-rounded. */
export function divide(a: string, b: string): string {
  const bUnits = toUnits(b);
  if (bUnits === ZERO) throw new Error('Division by zero');
  const numerator = toUnits(a) * SCALE;
  return fromUnits(bankerRoundBigint(numerator, bUnits));
}

/** Compare: returns -1, 0, or 1. */
export function compare(a: string, b: string): number {
  const aU = toUnits(a);
  const bU = toUnits(b);
  if (aU < bU) return -1;
  if (aU > bU) return 1;
  return 0;
}

/**
 * Banker's rounding (round half to even) of a decimal string to N
 * fractional digits. Default 4dp.
 */
export function bankersRound(value: string, decimalPlaces = 4): string {
  const units = toUnits(value); // already at 4dp scale
  if (decimalPlaces >= 4) {
    if (decimalPlaces === 4) return fromUnits(units);
    return `${fromUnits(units)}${'0'.repeat(decimalPlaces - 4)}`;
  }
  const reductionFactor = TEN ** BigInt(4 - decimalPlaces);
  const rounded = bankerRoundBigint(units, reductionFactor);
  // Render at the requested precision.
  const adjusted = rounded * reductionFactor;
  const formatted = fromUnits(adjusted);
  if (decimalPlaces === 0) return formatted.split('.')[0];
  const [intPart, fracPart = ''] = formatted.split('.');
  return `${intPart}.${(fracPart + '0000').slice(0, decimalPlaces)}`;
}

/**
 * Banker-round `numerator / divisor` to a bigint quotient. Used by
 * multiply/divide/bankersRound to keep precision losses out of the
 * intermediate JS number space.
 */
function bankerRoundBigint(numerator: bigint, divisor: bigint): bigint {
  if (divisor < ZERO) {
    return -bankerRoundBigint(-numerator, -divisor);
  }
  if (numerator < ZERO) {
    return -bankerRoundBigint(-numerator, divisor);
  }
  const quotient = numerator / divisor;
  const remainder = numerator % divisor;
  const doubled = remainder * TWO;
  if (doubled < divisor) return quotient;
  if (doubled > divisor) return quotient + ONE;
  // Exactly half — round to even.
  return quotient % TWO === ZERO ? quotient : quotient + ONE;
}
