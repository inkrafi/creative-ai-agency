import { IsEnum, IsObject, IsOptional, IsString, IsUUID, MinLength } from "class-validator";
import { BriefType } from "@prisma/client";

export class CreateBriefDto {
  // Optional now: a client submitting their own brief doesn't pick an
  // existing project anymore -- BriefsService.create() auto-creates one
  // behind the scenes when this is omitted. Staff (creating a brief inside
  // an existing project from the agency dashboard) still supplies it.
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsEnum(BriefType)
  type!: BriefType;

  // Shape depends on `type` -- see src/briefs/brief-context.ts for the
  // three field sets (LandingPageBriefContext / DesignBriefContext /
  // VideoBriefContext) and the required-field check applied in
  // BriefsService.create().
  @IsObject()
  context!: Record<string, unknown>;
}
