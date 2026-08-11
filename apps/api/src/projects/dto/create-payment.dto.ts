import { IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from "class-validator";
import { PaymentType } from "@prisma/client";

export class CreatePaymentDto {
  @IsEnum(PaymentType)
  type!: PaymentType;

  @IsInt()
  @Min(1)
  amountIdr!: number;

  // Free text on purpose ("Transfer BCA", "Cash", "QRIS", ...) -- this is
  // manual bookkeeping, not a payment gateway with a fixed method list.
  @IsString()
  @MinLength(1)
  method!: string;

  @IsOptional()
  @IsString()
  note?: string;
}
