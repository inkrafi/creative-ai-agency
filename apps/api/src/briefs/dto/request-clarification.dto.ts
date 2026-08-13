import { IsString, MinLength } from "class-validator";

export class RequestClarificationDto {
  @IsString()
  @MinLength(1)
  note!: string;
}
