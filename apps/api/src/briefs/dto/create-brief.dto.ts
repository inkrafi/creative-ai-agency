import { IsEnum, IsObject, IsString, IsUUID, MinLength } from "class-validator";
import { BriefType } from "@prisma/client";

export class CreateBriefDto {
  @IsUUID()
  projectId!: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsEnum(BriefType)
  type!: BriefType;

  // Shape depends on `type` -- see src/briefs/brief-context.ts for the two
  // field sets (WebsiteBriefContext / DesignBriefContext) and the
  // required-field check applied in BriefsService.create().
  @IsObject()
  context!: Record<string, unknown>;
}
