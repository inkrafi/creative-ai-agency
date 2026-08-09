import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { AssetType, GenerationJobStatus, TaskStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreditLedgerService } from "./credit-ledger.service";
import { GeminiImageProvider } from "../ai/providers/gemini-image.provider";
import { getImageModelPricing } from "../ai/model-pricing";
import { LocalImageStorageService } from "../storage/local-image-storage.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { IMAGE_GENERATION_QUEUE, ImageGenerationJobData } from "./image-job.types";

/**
 * Runs outside any HTTP request -- no CLS tenant context exists here, so
 * every DB write goes through prisma.runAsTenant(organizationId, ...)
 * explicitly (same reasoning as CreditLedgerService.settle/release's
 * comment: prisma.client fails RLS closed with no context, silently
 * updating zero rows rather than throwing).
 *
 * No retry configured on the enqueued job (see BriefsService.generateImage)
 * -- a retry after the credit hold has already been released/settled and
 * the job marked FAILED would re-run this whole flow against a job row
 * that's no longer PENDING, which this method doesn't handle. If retries
 * are wanted later, this needs idempotency guards first.
 */
@Processor(IMAGE_GENERATION_QUEUE)
export class ImageGenerationProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly creditLedger: CreditLedgerService,
    private readonly imageProvider: GeminiImageProvider,
    private readonly storage: LocalImageStorageService,
    private readonly realtime: RealtimeGateway,
  ) {
    super();
  }

  async process(job: Job<ImageGenerationJobData>): Promise<void> {
    const { organizationId, briefId, taskId, generationJobId, ledgerEntryId, prompt, userId } = job.data;

    try {
      await this.prisma.runAsTenant(organizationId, (tx) =>
        tx.generationJob.update({
          where: { id: generationJobId },
          data: { status: GenerationJobStatus.PROCESSING },
        }),
      );
      this.realtime.emitJobUpdate(organizationId, { jobId: generationJobId, briefId, taskId, status: "PROCESSING" });

      const { base64, mimeType } = await this.imageProvider.generateImage(prompt);
      const stored = await this.storage.save(organizationId, base64, mimeType);
      const actualCostMicros = getImageModelPricing(this.imageProvider.model);

      await this.prisma.runAsTenant(organizationId, async (tx) => {
        const last = await tx.asset.findFirst({ where: { taskId }, orderBy: { version: "desc" } });
        const version = (last?.version ?? 0) + 1;

        await tx.asset.create({
          data: {
            organizationId,
            taskId,
            type: AssetType.IMAGE,
            storagePath: stored.storagePath,
            version,
            createdById: userId,
          },
        });
        await tx.generationJob.update({
          where: { id: generationJobId },
          data: {
            status: GenerationJobStatus.COMPLETED,
            provider: this.imageProvider.name,
            model: this.imageProvider.model,
            actualCostMicros,
          },
        });
        await tx.task.update({ where: { id: taskId }, data: { status: TaskStatus.IN_REVIEW } });
      });

      await this.creditLedger.settle(organizationId, ledgerEntryId, actualCostMicros);

      this.realtime.emitJobUpdate(organizationId, {
        jobId: generationJobId,
        briefId,
        taskId,
        status: "COMPLETED",
        assetUrl: stored.url,
      });
    } catch (err) {
      await this.creditLedger.release(organizationId, ledgerEntryId).catch(() => {
        // Best-effort -- don't let cleanup failure mask the original error.
      });
      await this.prisma
        .runAsTenant(organizationId, (tx) =>
          tx.generationJob.update({
            where: { id: generationJobId },
            data: { status: GenerationJobStatus.FAILED, errorMessage: String(err) },
          }),
        )
        .catch(() => {
          // Best-effort -- same reasoning as above.
        });
      this.realtime.emitJobUpdate(organizationId, {
        jobId: generationJobId,
        briefId,
        taskId,
        status: "FAILED",
        errorMessage: "Generation failed. Please try again.",
      });
      throw err;
    }
  }
}
