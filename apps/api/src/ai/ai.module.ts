import { Module } from "@nestjs/common";
import { ModelRouterService } from "./model-router.service";
import { AnthropicProvider } from "./providers/anthropic.provider";
import { GeminiProvider } from "./providers/gemini.provider";

@Module({
  providers: [AnthropicProvider, GeminiProvider, ModelRouterService],
  exports: [ModelRouterService],
})
export class AiModule {}
