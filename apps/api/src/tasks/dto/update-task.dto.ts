import { PartialType, OmitType } from "@nestjs/mapped-types";
import { IsEnum, IsOptional } from "class-validator";
import { TaskStatus } from "@prisma/client";
import { CreateTaskDto } from "./create-task.dto";

export class UpdateTaskDto extends PartialType(OmitType(CreateTaskDto, ["projectId"] as const)) {
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;
}
