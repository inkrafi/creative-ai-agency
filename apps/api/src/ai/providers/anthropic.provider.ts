import { Injectable } from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";
import { AiProvider } from "./ai-provider.interface";
import { GenerationRequest, GenerationStream, GenerationUsage } from "../model-router.types";

@Injectable()
export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";
  readonly model = "claude-opus-5";

  // Zero-arg constructor resolves ANTHROPIC_API_KEY (or an `ant auth login`
  // profile) from the environment -- never hardcode a key here.
  private readonly client = new Anthropic();

  generate(request: GenerationRequest): GenerationStream {
    const anthropicStream = this.client.messages.stream({
      model: this.model,
      max_tokens: request.maxTokens,
      system: request.systemPrompt,
      // Draft copy doesn't need deep reasoning, and the design doc's latency
      // target for text is "<2s to first token" -- low effort keeps the
      // model's (still-on-by-default) adaptive thinking brief instead of
      // disabling it outright, which has its own failure modes (thinking
      // tags leaking into visible text).
      output_config: { effort: "low" },
      messages: [{ role: "user", content: request.prompt }],
    });

    async function* textDeltas() {
      for await (const event of anthropicStream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield event.delta.text;
        }
      }
    }

    return {
      textDeltas: textDeltas(),
      usage: async (): Promise<GenerationUsage> => {
        const final = await anthropicStream.finalMessage();
        return {
          provider: this.name,
          model: final.model,
          inputTokens: final.usage.input_tokens,
          outputTokens: final.usage.output_tokens,
        };
      },
    };
  }

  isQuotaExhausted(err: unknown): boolean {
    if (err instanceof Anthropic.RateLimitError) return true;
    if (err instanceof Anthropic.APIError) {
      const status = (err as { status?: number }).status;
      if (status === 429) return true;
      // Anthropic doesn't have a single dedicated "credit balance too low"
      // status code -- it surfaces as a 400/403 with a descriptive message.
      if ((status === 400 || status === 403) && /credit|quota|billing/i.test(err.message)) {
        return true;
      }
    }
    return false;
  }
}
