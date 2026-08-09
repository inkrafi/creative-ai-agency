import { HttpException, HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import { GenerationJobStatus, TaskStatus } from "@prisma/client";
import { Observable } from "rxjs";
import { MessageEvent } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ModelRouterService } from "../ai/model-router.service";
import { CreditLedgerService } from "../generation/credit-ledger.service";
import { AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { CreateBriefDto } from "./dto/create-brief.dto";

const GENERATION_MAX_TOKENS = 2048;
const SYSTEM_PROMPT =
  "You are a copywriter working inside a creative agency's tools. Write the " +
  "requested draft content directly. No preamble, no meta-commentary about " +
  "what you're about to write, no markdown headers unless the brief asks for them.";

@Injectable()
export class BriefsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly modelRouter: ModelRouterService,
    private readonly creditLedger: CreditLedgerService,
  ) {}

  /**
   * Creates the Brief and its first Task atomically (runAsTenant gives us a
   * real multi-statement transaction, unlike prisma.client which wraps each
   * call in its own). Matches the design doc's data shape: Project -> Brief
   * -> Task -> Asset(versions).
   */
  async create(user: AuthenticatedUser, dto: CreateBriefDto) {
    return this.prisma.runAsTenant(user.tenantId, async (tx) => {
      const brief = await tx.brief.create({
        data: {
          organizationId: user.tenantId,
          projectId: dto.projectId,
          title: dto.title,
          instructions: dto.instructions,
          createdById: user.userId,
        },
      });
      const task = await tx.task.create({
        data: {
          organizationId: user.tenantId,
          projectId: dto.projectId,
          briefId: brief.id,
          title: dto.title,
          createdById: user.userId,
        },
      });
      return { ...brief, taskId: task.id };
    });
  }

  findAll(projectId?: string) {
    return this.prisma.client.brief.findMany({
      where: projectId ? { projectId } : undefined,
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(id: string) {
    const brief = await this.prisma.client.brief.findUnique({ where: { id } });
    if (!brief) throw new NotFoundException("Brief not found");
    return brief;
  }

  /**
   * Streams a text draft to the client over SSE while logging a
   * GenerationJob for cost accounting -- see design doc §4.1: "Text can
   * stream directly for UX, but is still logged as a job for cost
   * accounting." Everything before the returned Observable (lookup, credit
   * reserve) runs synchronously so a 404/402 surfaces as a normal HTTP
   * error, not a broken SSE stream.
   */
  async generateStream(briefId: string, user: AuthenticatedUser): Promise<Observable<MessageEvent>> {
    const brief = await this.findOne(briefId);
    const task = await this.prisma.client.task.findFirst({ where: { briefId: brief.id } });
    if (!task) throw new NotFoundException("Brief has no task to generate a draft for");

    // Priced against the primary provider -- a safe upper bound even if the
    // request ends up served by a cheaper fallback provider.
    const estimatedMicros = this.creditLedger.estimateCostMicros(
      this.modelRouter.primaryModel,
      brief.instructions,
      GENERATION_MAX_TOKENS,
    );

    const job = await this.prisma.client.generationJob.create({
      data: {
        organizationId: user.tenantId,
        taskId: task.id,
        createdById: user.userId,
        model: this.modelRouter.primaryModel,
        estimatedCostMicros: estimatedMicros,
      },
    });

    const reserved = await this.creditLedger.reserve(user.tenantId, job.id, estimatedMicros);
    if (!reserved.ok) {
      await this.prisma.client.generationJob.update({
        where: { id: job.id },
        data: { status: GenerationJobStatus.FAILED, errorMessage: "insufficient_credit" },
      });
      throw new HttpException(
        `Insufficient credit balance (have ${reserved.balanceMicros}, need ${reserved.requestedMicros} micros)`,
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    await this.prisma.client.generationJob.update({
      where: { id: job.id },
      data: { status: GenerationJobStatus.PROCESSING },
    });

    return new Observable<MessageEvent>((subscriber) => {
      void this.runGeneration(subscriber, {
        brief,
        taskId: task.id,
        jobId: job.id,
        ledgerEntryId: reserved.ledgerEntryId,
        user,
      });
    });
  }

  private async runGeneration(
    subscriber: import("rxjs").Subscriber<MessageEvent>,
    ctx: {
      brief: { id: string; instructions: string };
      taskId: string;
      jobId: string;
      ledgerEntryId: string;
      user: AuthenticatedUser;
    },
  ) {
    let fullText = "";
    try {
      const stream = this.modelRouter.generate({
        systemPrompt: SYSTEM_PROMPT,
        prompt: ctx.brief.instructions,
        maxTokens: GENERATION_MAX_TOKENS,
      });

      for await (const delta of stream.textDeltas) {
        fullText += delta;
        subscriber.next({ data: delta });
      }

      const usage = await stream.usage();
      const actualMicros = this.creditLedger.actualCostMicros(
        usage.model,
        usage.inputTokens,
        usage.outputTokens,
      );

      const version = await this.nextAssetVersion(ctx.taskId);
      await this.prisma.client.asset.create({
        data: {
          organizationId: ctx.user.tenantId,
          taskId: ctx.taskId,
          content: fullText,
          version,
          createdById: ctx.user.userId,
        },
      });
      await this.prisma.client.generationJob.update({
        where: { id: ctx.jobId },
        data: {
          status: GenerationJobStatus.COMPLETED,
          // Corrected to whichever provider actually served the request --
          // may differ from the primary if a fallback kicked in.
          provider: usage.provider,
          model: usage.model,
          promptTokens: usage.inputTokens,
          completionTokens: usage.outputTokens,
          actualCostMicros: actualMicros,
        },
      });
      await this.creditLedger.settle(ctx.ledgerEntryId, actualMicros);
      await this.prisma.client.task.update({
        where: { id: ctx.taskId },
        data: { status: TaskStatus.IN_REVIEW },
      });

      subscriber.next({ type: "done", data: { version } });
      subscriber.complete();
    } catch (err) {
      await this.creditLedger.release(ctx.ledgerEntryId);
      await this.prisma.client.generationJob
        .update({
          where: { id: ctx.jobId },
          data: { status: GenerationJobStatus.FAILED, errorMessage: String(err) },
        })
        .catch(() => {
          // Best-effort -- don't let a logging failure mask the original error below.
        });

      subscriber.next({ type: "error", data: "Generation failed. Please try again." });
      subscriber.complete();
    }
  }

  private async nextAssetVersion(taskId: string): Promise<number> {
    const last = await this.prisma.client.asset.findFirst({
      where: { taskId },
      orderBy: { version: "desc" },
    });
    return (last?.version ?? 0) + 1;
  }
}
