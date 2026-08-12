import { IsBoolean, IsOptional, IsString } from "class-validator";

export class ClassifyRevisionDto {
  // true: counts against the client's included revisions (they asked for
  // something new/out of scope). false: free -- Kravio's own mistake.
  @IsBoolean()
  billable!: boolean;

  @IsOptional()
  @IsString()
  note?: string;
}
