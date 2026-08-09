import { Module } from "@nestjs/common";
import { ModelRouterService } from "./model-router.service";
import { AnthropicProvider } from "./providers/anthropic.provider";
import { GeminiProvider } from "./providers/gemini.provider";
import { AiProvider } from "./providers/ai-provider.interface";
import { AI_PROVIDERS } from "./providers/ai-providers.token";

@Module({
  providers: [
    AnthropicProvider,
    GeminiProvider,
    {
      provide: AI_PROVIDERS,
      useFactory: (anthropic: AnthropicProvider, gemini: GeminiProvider): AiProvider[] =>
        gemini.isConfigured ? [anthropic, gemini] : [anthropic],
      inject: [AnthropicProvider, GeminiProvider],
    },
    ModelRouterService,
  ],
  exports: [ModelRouterService],
})
export class AiModule {}
