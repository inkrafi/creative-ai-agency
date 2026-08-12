import { IsIn, IsString, MinLength, ValidateIf } from "class-validator";

export class VerifyPaymentDto {
  @IsIn(["VERIFIED", "REJECTED"])
  decision!: "VERIFIED" | "REJECTED";

  // Required exactly when rejecting (@ValidateIf gates the check -- not
  // combined with @IsOptional(), which would silently skip it) -- a client
  // who submitted real proof deserves to know why it didn't count, not
  // just that it didn't. Not validated at all on VERIFIED (nothing to
  // explain); still accepted there since forbidNonWhitelisted only cares
  // that the field is declared, not that it's used.
  @ValidateIf((o) => o.decision === "REJECTED")
  @IsString()
  @MinLength(1)
  note?: string;
}
