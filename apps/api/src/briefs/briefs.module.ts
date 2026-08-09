import { Module } from "@nestjs/common";
import { BriefsController } from "./briefs.controller";
import { BriefsService } from "./briefs.service";
import { AiModule } from "../ai/ai.module";
import { GenerationModule } from "../generation/generation.module";

@Module({
  imports: [AiModule, GenerationModule],
  controllers: [BriefsController],
  providers: [BriefsService],
})
export class BriefsModule {}
