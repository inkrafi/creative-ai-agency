import { Module } from "@nestjs/common";
import { CreditLedgerService } from "./credit-ledger.service";

@Module({
  providers: [CreditLedgerService],
  exports: [CreditLedgerService],
})
export class GenerationModule {}
