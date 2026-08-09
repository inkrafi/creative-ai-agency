import { Inject, Injectable } from "@nestjs/common";
import { AiProvider } from "./providers/ai-provider.interface";
import { AI_PROVIDERS } from "./providers/ai-providers.token";
import { GenerationRequest, GenerationStream, GenerationUsage } from "./model-router.types";

/**
 * Thin abstraction over the LLM provider(s). Callers (BriefsService) never
 * import @anthropic-ai/sdk or @google/genai directly -- adding, removing,
 * or reordering providers only touches AiModule's AI_PROVIDERS factory. See
 * design doc §7 (risk mitigations): "Model Router abstraction from day one"
 * and "Model Router with fallback chain across providers."
 *
 * Depends on the AiProvider *interface* (injected via AI_PROVIDERS), not
 * the concrete Anthropic/Gemini classes -- that's what lets
 * model-router.service.spec.ts test the fallback logic with fake providers
 * instead of hitting real, billable APIs.
 *
 * Fallback only kicks in when a provider's quota/credit is exhausted
 * BEFORE it has streamed any text -- once a provider has started streaming
 * to the client, switching providers mid-response would duplicate or
 * garble output, so a mid-stream failure is a hard failure instead.
 */
@Injectable()
export class ModelRouterService {
  constructor(@Inject(AI_PROVIDERS) private readonly providers: AiProvider[]) {}

  /** Used to price the pre-flight credit estimate against; see CreditLedgerService. */
  get primaryModel(): string {
    return this.providers[0].model;
  }

  generate(request: GenerationRequest): GenerationStream {
    const providers = this.providers;
    let usageFn: (() => Promise<GenerationUsage>) | undefined;

    async function* textDeltas(): AsyncGenerator<string> {
      let lastError: unknown;

      for (const provider of providers) {
        const stream = provider.generate(request);
        let yieldedAny = false;
        try {
          for await (const delta of stream.textDeltas) {
            yieldedAny = true;
            yield delta;
          }
          usageFn = stream.usage;
          return;
        } catch (err) {
          if (yieldedAny || !provider.isQuotaExhausted(err)) throw err;
          lastError = err;
          // Quota exhausted before any output from this provider -- try the next one.
        }
      }
      throw lastError;
    }

    return {
      textDeltas: textDeltas(),
      usage: async (): Promise<GenerationUsage> => {
        if (!usageFn) throw new Error("usage() called before textDeltas was fully drained");
        return usageFn();
      },
    };
  }
}
