import { IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";
import { PaymentType } from "@prisma/client";

/**
 * Client-facing counterpart to CreatePaymentDto -- same shape plus the
 * proof image, since this is the client asserting a payment happened
 * (PENDING until staff verifies it) rather than staff already having
 * confirmed it. See ProjectsService.claimPayment().
 */
export class ClaimPaymentDto {
  @IsEnum(PaymentType)
  type!: PaymentType;

  @IsInt()
  @Min(1)
  amountIdr!: number;

  @IsString()
  @MinLength(1)
  method!: string;

  @IsOptional()
  @IsString()
  note?: string;

  // Data URI (e.g. "data:image/png;base64,...") -- validated as non-empty
  // text here; ProjectsService doesn't parse or re-encode it, just stores
  // it as-is. See Payment.proofImageUrl's schema comment for the storage
  // tradeoff this implies.
  @IsString()
  @MinLength(1)
  proofImageBase64!: string;
}
