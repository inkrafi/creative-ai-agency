import { IsString, MinLength } from "class-validator";

export class RequestRevisionDto {
  // Required, not optional: see RevisionRequest's schema comment -- a
  // revision request with no explanation leaves nothing to act on.
  @IsString()
  @MinLength(1)
  note!: string;
}
