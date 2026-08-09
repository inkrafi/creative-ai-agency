import { Injectable } from "@nestjs/common";
import { Prisma, LedgerEntryStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { getModelPricing } from "../ai/model-pricing";

export type ReserveResult =
  | { ok: true; ledgerEntryId: string }
  | { ok: false; balanceMicros: number; requestedMicros: number };

const MAX_SERIALIZATION_RETRIES = 3;

/**
 * Append-only ledger -- never a mutated balance column. Balance for a
 * tenant is SUM(amountMicros) over its rows. See the design discussion:
 * this is a hold-then-settle pattern (like a credit card authorization),
 * which is *why* it needs Serializable isolation on the reserve step --
 * two concurrent reserve() calls both reading the same pre-hold balance is
 * exactly the double-spend race a plain READ COMMITTED check-then-insert
 * would allow. Serializable makes Postgres abort one of the two
 * transactions (P2034) instead of letting both succeed; we retry it.
 */
@Injectable()
export class CreditLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  estimateCostMicros(model: string, promptText: string, maxTokens: number): number {
    const pricing = getModelPricing(model);
    // max_tokens bounds output (thinking + response text) but NOT input, so
    // input has to be estimated separately. Rough chars-per-token heuristic
    // is deliberately generous -- this is a pre-flight ceiling, not a bill.
    const estimatedInputTokens = Math.ceil(promptText.length / 4);
    // Rounded because per-token rates can be fractional (e.g. Gemini's) and
    // the DB column is an integer -- sub-micro precision has no real value.
    return Math.round(estimatedInputTokens * pricing.input + maxTokens * pricing.output);
  }

  actualCostMicros(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = getModelPricing(model);
    return Math.round(inputTokens * pricing.input + outputTokens * pricing.output);
  }

  /**
   * Places a PENDING hold for `estimatedMicros` if the tenant's balance
   * covers it, atomically. Call this BEFORE dispatching any request to the
   * model -- never after.
   */
  async reserve(
    organizationId: string,
    generationJobId: string,
    estimatedMicros: number,
  ): Promise<ReserveResult> {
    for (let attempt = 1; attempt <= MAX_SERIALIZATION_RETRIES; attempt++) {
      try {
        return await this.prisma.runAsTenant(
          organizationId,
          async (tx) => {
            const agg = await tx.creditLedgerEntry.aggregate({
              _sum: { amountMicros: true },
            });
            const balance = agg._sum.amountMicros ?? 0;

            if (balance < estimatedMicros) {
              return { ok: false, balanceMicros: balance, requestedMicros: estimatedMicros };
            }

            const entry = await tx.creditLedgerEntry.create({
              data: {
                organizationId,
                amountMicros: -estimatedMicros,
                status: LedgerEntryStatus.PENDING,
                generationJobId,
                reason: "generation_hold",
              },
            });
            return { ok: true, ledgerEntryId: entry.id };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (err) {
        const isSerializationFailure =
          err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034";
        if (!isSerializationFailure || attempt === MAX_SERIALIZATION_RETRIES) throw err;
        // Concurrent reserve() for the same tenant collided; retry immediately
        // with fresh data rather than surfacing a transient conflict to the user.
      }
    }
    throw new Error("unreachable");
  }

  /** Corrects a hold to the real cost once usage is known. */
  async settle(ledgerEntryId: string, actualMicros: number): Promise<void> {
    await this.prisma.client.creditLedgerEntry.update({
      where: { id: ledgerEntryId },
      data: { amountMicros: -actualMicros, status: LedgerEntryStatus.SETTLED, reason: "generation_settled" },
    });
  }

  /** Releases a hold when generation fails -- the tenant isn't charged for it. */
  async release(ledgerEntryId: string): Promise<void> {
    await this.prisma.client.creditLedgerEntry.update({
      where: { id: ledgerEntryId },
      data: { amountMicros: 0, status: LedgerEntryStatus.SETTLED, reason: "generation_failed_released" },
    });
  }
}
