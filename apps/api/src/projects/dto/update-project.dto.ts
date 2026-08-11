import { PartialType } from "@nestjs/mapped-types";
import { IsEnum, IsInt, IsOptional, Min } from "class-validator";
import { ProjectStatus } from "@prisma/client";
import { CreateProjectDto } from "./create-project.dto";

export class UpdateProjectDto extends PartialType(CreateProjectDto) {
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  // Not on CreateProjectDto -- the price is usually agreed after the
  // initial brief discussion, not known at project creation.
  @IsOptional()
  @IsInt()
  @Min(0)
  totalPriceIdr?: number;
}
