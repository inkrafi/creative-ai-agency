import { IsIn } from "class-validator";

export class VerifyPaymentDto {
  @IsIn(["VERIFIED", "REJECTED"])
  decision!: "VERIFIED" | "REJECTED";
}
