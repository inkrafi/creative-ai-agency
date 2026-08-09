import { Injectable } from "@nestjs/common";
import { GoogleGenAI } from "@google/genai";
import { AiProvider } from "./ai-provider.interface";
import { GenerationRequest, GenerationStream, GenerationUsage } from "../model-router.types";

/**
 * Fallback provider, only used when AnthropicProvider reports its quota/
 * credit exhausted -- see design doc §7: "Model Router with fallback chain
 * across providers." Gemini's Node SDK docs don't publish a typed exception
 * class for rate-limit/quota errors (unlike Anthropic's), so
 * isQuotaExhausted() below is a best-effort shape check on the error
 * object rather than an `instanceof` check -- verify against the live SDK
 * if fallback behavior needs to be debugged.
 *
 * Event/field names below (step.delta, interaction.completed,
 * system_instruction, generation_config.max_output_tokens) were confirmed
 * directly against the installed @google/genai package's own .d.ts file
 * for the exact installed version (2.x) -- this SDK's event-type naming
 * has already changed once between its 1.x and 2.x majors (content.delta
 * -> step.delta, interaction.complete -> interaction.completed), so don't
 * trust these strings from memory or docs without re-checking the .d.ts
 * that ships with whatever version is actually in node_modules.
 */
@Injectable()
export class GeminiProvider implements AiProvider {
  readonly name = "gemini";
  readonly model = "gemini-3.6-flash";

  private readonly client = new GoogleGenAI({});

  get isConfigured(): boolean {
    return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  }

  generate(request: GenerationRequest): GenerationStream {
    const model = this.model;
    const providerName = this.name;
    const client = this.client;
    let resolvedUsage: GenerationUsage | undefined;

    async function* textDeltas() {
      const stream = await client.interactions.create({
        model,
        input: request.prompt,
        system_instruction: request.systemPrompt,
        generation_config: { max_output_tokens: request.maxTokens },
        stream: true,
      });

      for await (const event of stream) {
        if (event.event_type === "step.delta" && event.delta.type === "text") {
          yield event.delta.text;
        }
        if (event.event_type === "interaction.completed") {
          const usage = event.interaction.usage;
          resolvedUsage = {
            provider: providerName,
            model,
            inputTokens: usage?.total_input_tokens ?? 0,
            outputTokens: usage?.total_output_tokens ?? 0,
          };
        }
      }
    }

    return {
      textDeltas: textDeltas(),
      usage: async (): Promise<GenerationUsage> => {
        if (!resolvedUsage) {
          throw new Error(
            "Gemini usage unavailable -- textDeltas must be fully drained (until interaction.completed) before calling usage()",
          );
        }
        return resolvedUsage;
      },
    };
  }

  isQuotaExhausted(err: unknown): boolean {
    const e = err as { status?: number; code?: string; message?: string };
    if (e?.status === 429) return true;
    if (e?.code === "rate_limit_exceeded" || e?.code === "quota_exceeded") return true;
    if (e?.message && /quota|rate.?limit/i.test(e.message)) return true;
    return false;
  }
}
