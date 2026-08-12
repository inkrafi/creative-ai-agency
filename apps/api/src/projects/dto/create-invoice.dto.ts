import { IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";

export class CreateInvoiceDto {
  @IsInt()
  @Min(1)
  amountIdr!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  minDpPercent?: number;

  @IsOptional()
  @IsUUID()
  briefId?: string;
}
