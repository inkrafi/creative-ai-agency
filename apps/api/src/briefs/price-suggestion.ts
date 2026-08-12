import { BadGatewayException } from "@nestjs/common";
import { Brief } from "@prisma/client";

// Generous for what's ultimately a short JSON reply -- Anthropic's
// extended-thinking budget is drawn from the same max_tokens allocation
// (even at output_config.effort: "low", see AnthropicProvider), so a tight
// budget here risks the visible completion getting truncated before the
// closing brace rather than the "reasoning" text being the long part.
const PRICE_SUGGESTION_MAX_TOKENS = 1024;

export const PRICE_SUGGESTION_SYSTEM_PROMPT =
  "You are a pricing analyst at a creative agency operating in Indonesia. Given a client brief, estimate a " +
  "fair project price in Indonesian Rupiah (IDR), weighing typical Indonesian market rates for freelance/agency " +
  "creative work against the brief's apparent complexity (scope, number of pages or deliverables implied, any " +
  "stated constraints). Respond with STRICT JSON only -- no markdown fences, no commentary before or after -- " +
  'in exactly this shape: {"priceIdr": <integer>, "reasoning": "<2-3 sentences in Indonesian explaining the estimate>"}.';

export function formatPricePrompt(brief: Pick<Brief, "type" | "instructions">): string {
  return `Jenis brief: ${brief.type}\n\n${brief.instructions}`;
}

export interface PriceSuggestion {
  priceIdr: number;
  reasoning: string;
}

/**
 * Defensive on purpose -- an LLM asked for "strict JSON" still sometimes
 * wraps it in a markdown fence or adds a stray sentence. Fails loudly
 * (BadGatewayException, not a silently-stored garbage value) rather than
 * persisting something that isn't actually a usable price -- consistent
 * with the rest of this codebase's fail-loud philosophy around AI output.
 */
export function parsePriceSuggestion(raw: string): PriceSuggestion {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    throw new BadGatewayException("AI price suggestion could not be parsed. Please retry.");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new BadGatewayException("AI price suggestion had an unexpected shape. Please retry.");
  }

  const priceIdr: unknown = (parsed as Record<string, unknown>).priceIdr;
  const reasoning: unknown = (parsed as Record<string, unknown>).reasoning;

  if (
    typeof priceIdr !== "number" ||
    !Number.isFinite(priceIdr) ||
    priceIdr <= 0 ||
    typeof reasoning !== "string" ||
    reasoning === ""
  ) {
    throw new BadGatewayException("AI price suggestion had an unexpected shape. Please retry.");
  }

  return { priceIdr: Math.round(priceIdr), reasoning };
}

export { PRICE_SUGGESTION_MAX_TOKENS };
