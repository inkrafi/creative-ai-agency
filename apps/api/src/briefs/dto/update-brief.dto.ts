import { IsObject } from "class-validator";

/**
 * Client-facing edit -- only usable to respond to a needsClarification
 * brief (see BriefsService.update()). Title/type stay fixed; only the
 * structured context (and the instructions/prompt derived from it) can
 * change, since that's the actual content staff asked to be clarified.
 */
export class UpdateBriefDto {
  @IsObject()
  context!: Record<string, unknown>;
}
