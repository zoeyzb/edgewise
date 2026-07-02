/**
 * Money Confidence Score (0–100).
 */

export interface MoneyConfidenceInput {
  edgeQualityScore: number;
  expectedDollarValue: number;
  liquidityScore: number;
  fillProbability: number;
  closingPriceValuePotential: number;
  falseEdgeRisk: number;
  marketTypeReliability: number;
  sportReliability: number;
  dataFreshness: number;
}

export function computeMoneyConfidenceScore(input: MoneyConfidenceInput): number {
  let score = input.edgeQualityScore * 0.45;
  score += Math.min(20, input.expectedDollarValue * 0.5);
  score += input.liquidityScore * 0.1;
  score += input.fillProbability * 15;
  score += input.closingPriceValuePotential * 5;
  score += input.marketTypeReliability * 8;
  score += input.sportReliability * 5;
  score += input.dataFreshness * 10;
  score -= input.falseEdgeRisk * 25;

  return Math.round(Math.max(0, Math.min(100, score)));
}
