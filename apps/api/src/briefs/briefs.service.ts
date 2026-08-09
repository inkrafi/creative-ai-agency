import { Injectable, NotFoundException } from "@nestjs/common";
import { GenerationJobStatus, Prisma, TaskStatus } from "@prisma/client";
import { Observable } from "rxjs";
import { MessageEvent } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ModelRouterService } from "../ai/model-router.service";
import { CreditLedgerService } from "../generation/credit-ledger.service";
import { AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { CreateBriefDto } from "./dto/create-brief.dto";
import { BRIEF_SYSTEM_PROMPTS, formatBriefPrompt, validateBriefContext } from "./brief-context";

const GENERATION_MAX_TOKENS = 2048;

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
    validateBriefContext(dto.type, dto.context);
    const instructions = formatBriefPrompt(dto.type, dto.context);

    return this.prisma.runAsTenant(user.tenantId, async (tx) => {
      const brief = await tx.brief.create({
        data: {
          organizationId: user.tenantId,
          projectId: dto.projectId,
          title: dto.title,
          type: dto.type,
          // dto.context is already validated JSON-object shape (@IsObject()
          // + validateBriefContext() above); Prisma's InputJsonValue type
          // just needs the cast since it doesn't accept a plain
          // Record<string, unknown> structurally.
          context: dto.context as Prisma.InputJsonValue,
          instructions,
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
   * accounting."
   *
   * Returns the Observable synchronously and does ALL async work (brief
   * lookup, credit reserve, the model call itself) inside its subscribe
   * callback -- deliberately, not as an async controller method that
   * `throw`s for a 404/402. Nest's @Sse() commits the response as
   * `200 text/event-stream` as soon as the route is invoked, before the
   * handler's promise settles, so an exception thrown before returning the
   * Observable does NOT reach the client as a real HTTP error status (it
   * was observed silently becoming `200` with an empty body -- caught by
   * test/briefs.e2e-spec.ts). So every failure mode here -- not found,
   * insufficient credit, mid-stream provider failure -- is reported the
   * same way: an `event: error` SSE message. Callers must not expect a
   * 404/402 from this endpoint; they must inspect the SSE event stream.
   */
  generateStream(briefId: string, user: AuthenticatedUser): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      void this.runGeneration(subscriber, briefId, user);
    });
  }

  /**
   * One flat try/catch covering the whole flow, deliberately not split
   * across nested helpers -- an earlier version split "reserve credit" and
   * "stream from the model" into two functions with a rethrow between them,
   * which left a real gap: if reserve() itself threw (not its normal
   * `{ok:false}` return, but an actual exception) the rethrow escaped
   * `void this.runGeneration(...)` as an unhandled rejection, and the SSE
   * connection just hung with no error event and no cleanup. Cleanup here
   * is conditional on how far execution got (jobId / ledgerEntryId set),
   * not on which sub-step failed.
   */
  private async runGeneration(
    subscriber: import("rxjs").Subscriber<MessageEvent>,
    briefId: string,
    user: AuthenticatedUser,
  ) {
    let jobId: string | undefined;
    let ledgerEntryId: string | undefined;
    let fullText = "";

    try {
      const brief = await this.findOne(briefId);
      const task = await this.prisma.client.task.findFirst({ where: { briefId: brief.id } });
      if (!task) throw new NotFoundException("Brief has no task to generate a draft for");

      // Priced against the primary provider -- a safe upper bound even if
      // the request ends up served by a cheaper fallback provider.
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
      jobId = job.id;

      const reserved = await this.creditLedger.reserve(user.tenantId, job.id, estimatedMicros);
      if (!reserved.ok) {
        await this.prisma.client.generationJob.update({
          where: { id: job.id },
          data: { status: GenerationJobStatus.FAILED, errorMessage: "insufficient_credit" },
        });
        subscriber.next({ type: "error", data: "Insufficient credit balance." });
        subscriber.complete();
        return;
      }
      ledgerEntryId = reserved.ledgerEntryId;

      await this.prisma.client.generationJob.update({
        where: { id: job.id },
        data: { status: GenerationJobStatus.PROCESSING },
      });

      const stream = this.modelRouter.generate({
        systemPrompt: BRIEF_SYSTEM_PROMPTS[brief.type],
        prompt: brief.instructions,
        maxTokens: GENERATION_MAX_TOKENS,
      });

      for await (const delta of stream.textDeltas) {
        fullText += delta;
        subscriber.next({ data: delta });
      }

      const usage = await stream.usage();
      const actualMicros = this.creditLedger.actualCostMicros(usage.model, usage.inputTokens, usage.outputTokens);

      const version = await this.nextAssetVersion(task.id);
      await this.prisma.client.asset.create({
        data: {
          organizationId: user.tenantId,
          taskId: task.id,
          content: fullText,
          version,
          createdById: user.userId,
        },
      });
      await this.prisma.client.generationJob.update({
        where: { id: job.id },
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
      await this.creditLedger.settle(user.tenantId, ledgerEntryId, actualMicros);
      // IN_PROGRESS, not IN_REVIEW: this AI draft is raw material for the
      // agency's own designer/developer, not a client-ready deliverable --
      // see brief-context.ts's BRIEF_SYSTEM_PROMPTS comment. IN_REVIEW is
      // reserved for TasksService.submitForReview(), once a human has
      // actually done the work this draft was a starting point for.
      await this.prisma.client.task.update({
        where: { id: task.id },
        data: { status: TaskStatus.IN_PROGRESS },
      });

      subscriber.next({ type: "done", data: { version } });
      subscriber.complete();
    } catch (err) {
      if (ledgerEntryId) {
        await this.creditLedger.release(user.tenantId, ledgerEntryId).catch(() => {
          // Best-effort -- don't let a cleanup failure mask the original error below.
        });
      }
      if (jobId) {
        await this.prisma.client.generationJob
          .update({
            where: { id: jobId },
            data: { status: GenerationJobStatus.FAILED, errorMessage: String(err) },
          })
          .catch(() => {
            // Best-effort -- same reasoning as above.
          });
      }
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
