/**
 * Kalshi fee and rounding estimates — conservative, not guaranteed exact.
 */

export const KALSHI_FEE_NOTE =
  "Conservative fee estimate — verify exact fee schedule at execution time";

/** Taker fee as fraction of expected profit (conservative). */
export const DEFAULT_TAKER_FEE_ON_PROFIT = 0.07;

/** Minimum fee per contract in dollars (conservative rounding). */
export const MIN_FEE_PER_CONTRACT = 0.01;

export interface FeeBreakdown {
  grossFees: number;
  feeRounding: number;
  totalFees: number;
  note: string;
}

export function calculateKalshiFees(input: {
  stakeDollars: number;
  executableAsk: number;
  fairProbability: number;
  feeRateOnProfit?: number;
}): FeeBreakdown {
  const ask = input.executableAsk;
  const stake = Math.max(0, input.stakeDollars);
  if (ask <= 0 || stake <= 0) {
    return { grossFees: 0, feeRounding: 0, totalFees: 0, note: KALSHI_FEE_NOTE };
  }

  const contracts = stake / ask;
  const expectedProfitPerContract = Math.max(0, input.fairProbability - ask);
  const grossProfit = contracts * expectedProfitPerContract;
  const rate = input.feeRateOnProfit ?? DEFAULT_TAKER_FEE_ON_PROFIT;
  const grossFees = Math.max(MIN_FEE_PER_CONTRACT, grossProfit * rate);
  const rounded = Math.ceil(grossFees * 100) / 100;
  const feeRounding = Math.max(0, rounded - grossFees);

  return {
    grossFees,
    feeRounding,
    totalFees: rounded,
    note: KALSHI_FEE_NOTE,
  };
}

export function feeAsEdgeFraction(input: {
  stakeDollars: number;
  executableAsk: number;
  fairProbability: number;
}): number {
  const fees = calculateKalshiFees(input);
  const stake = Math.max(input.stakeDollars, 1);
  return fees.totalFees / stake;
}
