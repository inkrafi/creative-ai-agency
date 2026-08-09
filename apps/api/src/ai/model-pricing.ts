/**
 * Micros = millionths of a dollar (1_000_000 micros = $1.00). Per-token
 * rates can be fractional (Gemini's aren't clean integers); callers must
 * round the final computed cost before writing to the DB's Int columns --
 * see CreditLedgerService.estimateCostMicros / actualCostMicros.
 *
 * Sources (fetched from official docs, not from training-data memory --
 * pricing drifts fast):
 *  - claude-opus-5: $5 / $25 per 1M input/output tokens.
 *  - gemini-3.6-flash: $1.50 / $7.50 per 1M input/output tokens (standard tier).
 */
export const MODEL_PRICING_MICROS_PER_TOKEN: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "gemini-3.6-flash": { input: 1.5, output: 7.5 },
};

export function getModelPricing(model: string): { input: number; output: number } {
  const pricing = MODEL_PRICING_MICROS_PER_TOKEN[model];
  if (!pricing) throw new Error(`No pricing configured for model "${model}"`);
  return pricing;
}
