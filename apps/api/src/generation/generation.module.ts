import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { CreditLedgerService } from "./credit-ledger.service";
import { ImageGenerationProcessor } from "./image-generation.processor";
import { IMAGE_GENERATION_QUEUE } from "./image-job.types";
import { GeminiImageProvider } from "../ai/providers/gemini-image.provider";
import { LocalImageStorageService } from "../storage/local-image-storage.service";
import { RealtimeModule } from "../realtime/realtime.module";

@Module({
  // BullModule re-exported below so BriefsModule (importing GenerationModule)
  // can @InjectQueue(IMAGE_GENERATION_QUEUE) without registering it a second time.
  imports: [BullModule.registerQueue({ name: IMAGE_GENERATION_QUEUE }), RealtimeModule],
  providers: [CreditLedgerService, GeminiImageProvider, LocalImageStorageService, ImageGenerationProcessor],
  exports: [CreditLedgerService, GeminiImageProvider, BullModule],
})
export class GenerationModule {}
