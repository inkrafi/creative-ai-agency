import { PartialType } from "@nestjs/mapped-types";
import { IsEnum, IsISO8601, IsInt, IsOptional, IsUUID, Min } from "class-validator";
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

  // Staff-only "assign a client" action -- links a legacy project (created
  // before self-service existed, or created by staff on a client's behalf)
  // to the CLIENT_APPROVER who should now see it. See
  // client-project-access.ts for what this field gates.
  @IsOptional()
  @IsUUID()
  clientOwnerId?: string;

  // An expectation-setter shown on the client's project view, not an
  // enforced SLA -- see Project.targetCompletionDate's schema comment.
  @IsOptional()
  @IsISO8601()
  targetCompletionDate?: string;
}
