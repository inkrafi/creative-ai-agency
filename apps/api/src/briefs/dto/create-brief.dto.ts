import { IsString, IsUUID, MinLength } from "class-validator";

export class CreateBriefDto {
  @IsUUID()
  projectId!: string;

  @IsString()
  @MinLength(1)
  title!: string;

  @IsString()
  @MinLength(1)
  instructions!: string;
}
