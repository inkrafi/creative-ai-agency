import { BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import { TaskStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { assertClientOwnsProject } from "../common/client-project-access";
import { CreateTaskDto } from "./dto/create-task.dto";
import { UpdateTaskDto } from "./dto/update-task.dto";
import { SubmitForReviewDto } from "./dto/submit-for-review.dto";
import { RequestRevisionDto } from "./dto/request-revision.dto";
import { ClassifyRevisionDto } from "./dto/classify-revision.dto";

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, createdById: string, dto: CreateTaskDto) {
    // findUniqueOrThrow instead of a manual existence check: RLS means this
    // throws (via Prisma's not-found error) both when the project genuinely
    // doesn't exist AND when it belongs to another tenant -- the two cases
    // are indistinguishable from the caller's side by design.
    const project = await this.prisma.client.project.findUniqueOrThrow({
      where: { id: dto.projectId },
    });

    return this.prisma.client.task.create({
      data: {
        organizationId,
        projectId: project.id,
        title: dto.title,
        description: dto.description,
        assignedToId: dto.assignedToId,
        createdById,
      },
    });
  }

  async findAllForProject(projectId: string, user: AuthenticatedUser) {
    await assertClientOwnsProject(this.prisma, projectId, user);
    return this.prisma.client.task.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      include: {
        deliverables: { orderBy: { version: "desc" } },
        revisionRequests: { orderBy: { round: "desc" } },
      },
    });
  }

  async findOne(id: string) {
    const task = await this.prisma.client.task.findUnique({
      where: { id },
      include: {
        deliverables: { orderBy: { version: "desc" } },
        revisionRequests: { orderBy: { round: "desc" } },
      },
    });
    if (!task) throw new NotFoundException("Task not found");
    return task;
  }

  /** The client-reachable counterpart to findOne() -- see ProjectsService.findOneForClient(). */
  async findOneForClient(id: string, user: AuthenticatedUser) {
    const task = await this.findOne(id);
    await assertClientOwnsProject(this.prisma, task.projectId, user);
    return task;
  }

  async update(id: string, dto: UpdateTaskDto) {
    await this.findOne(id);
    return this.prisma.client.task.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.client.task.delete({ where: { id } });
  }

  /**
   * A human (designer/developer) has finished working from the AI draft and
   * is putting the result up for the client to look at. Requires a
   * Deliverable (a real link the client can open) -- "submit for review"
   * with nothing concrete to look at isn't a real review request, see
   * Deliverable's schema comment. Versioned the same way Asset is, so a
   * second submission (after a revision round) doesn't overwrite what was
   * shown last time.
   *
   * Not restricted to @Roles(CLIENT_*) the way approve()/requestRevision()
   * conceptually should be eventually -- there's no client-facing auth yet
   * (see design doc's Client Portal, not built), so any tenant member can
   * call this for now. Revisit once that portal exists.
   */
  async submitForReview(id: string, userId: string, dto: SubmitForReviewDto) {
    const task = await this.findOne(id);
    if (task.status === TaskStatus.DONE) {
      throw new BadRequestException("This task is already done.");
    }

    const nextVersion = (task.deliverables[0]?.version ?? 0) + 1;

    return this.prisma.runAsTenant(task.organizationId, async (tx) => {
      await tx.deliverable.create({
        data: {
          organizationId: task.organizationId,
          taskId: id,
          url: dto.deliverableUrl,
          note: dto.deliverableNote,
          version: nextVersion,
          createdById: userId,
        },
      });
      return tx.task.update({
        where: { id },
        data: { status: TaskStatus.IN_REVIEW },
        include: {
          deliverables: { orderBy: { version: "desc" } },
          revisionRequests: { orderBy: { round: "desc" } },
        },
      });
    });
  }

  /**
   * Client asks for changes. Hard-blocks once `revisionsUsed` reaches
   * `maxRevisions` -- mirrors CreditLedgerService's "check before, not
   * after" philosophy: agencies commonly include a fixed number of
   * revision rounds per brief, and unlimited free revisions is exactly the
   * kind of scope creep that quietly erodes margin. 402, not 400: this is
   * a "you've used what's included" limit, the same shape as insufficient
   * credit, not a malformed request.
   *
   * Unless staff has opted the project into `extraRevisionPriceIdr`: every
   * over-quota request then goes through instead of blocking, immediately
   * billed (there's no ambiguity to triage -- being over quota *is* the
   * reason it's billable) via an auto-generated Invoice, and both
   * `maxRevisions`/`revisionsUsed` grow by one together so the counter
   * reads as "used all of an expanded quota" rather than something that
   * looks like a bug (4/3) -- repeatable for as long as the field stays
   * set, not a one-shot exception. This is the one path where a
   * RevisionRequest is created already classified -- every other request
   * still goes through classifyRevisionRequest() as a separate,
   * asynchronous decision, same as before.
   *
   * Logs a RevisionRequest (round = the running count of requests so far,
   * billable or not) alongside the status flip -- see its schema comment
   * for why `note` is required. The task flips to IN_PROGRESS immediately
   * either way so staff can start the work right away.
   */
  async requestRevision(id: string, user: AuthenticatedUser, dto: RequestRevisionDto) {
    const task = await this.findOne(id);
    await assertClientOwnsProject(this.prisma, task.projectId, user);
    if (task.status !== TaskStatus.IN_REVIEW) {
      throw new BadRequestException("Only a task currently in review can have a revision requested.");
    }

    const overQuota = task.revisionsUsed >= task.maxRevisions;
    let project: { totalPriceIdr: number | null; extraRevisionPriceIdr: number | null } | null = null;

    if (overQuota) {
      project = await this.prisma.client.project.findUniqueOrThrow({
        where: { id: task.projectId },
        select: { totalPriceIdr: true, extraRevisionPriceIdr: true },
      });
      if (project.extraRevisionPriceIdr === null) {
        throw new HttpException(
          `Revision limit reached (${task.revisionsUsed}/${task.maxRevisions} used). Additional revisions need a new arrangement.`,
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
    }

    const round = task.revisionRequests.length + 1;
    const extraPrice = project?.extraRevisionPriceIdr;

    return this.prisma.runAsTenant(task.organizationId, async (tx) => {
      await tx.revisionRequest.create({
        data: {
          organizationId: task.organizationId,
          taskId: id,
          note: dto.note,
          round,
          createdById: user.userId,
          ...(overQuota
            ? {
                billable: true,
                classifiedAt: new Date(),
                classificationNote: `Revisi tambahan di luar kuota -- otomatis ditagih Rp ${extraPrice!.toLocaleString("id-ID")}.`,
              }
            : {}),
        },
      });

      if (overQuota) {
        await tx.invoice.create({
          data: {
            organizationId: task.organizationId,
            projectId: task.projectId,
            amountIdr: extraPrice!,
            note: `Revisi tambahan di luar kuota untuk "${task.title}"`,
            createdById: user.userId,
          },
        });
        await tx.project.update({
          where: { id: task.projectId },
          data: {
            totalPriceIdr: project!.totalPriceIdr === null ? extraPrice! : { increment: extraPrice! },
          },
        });
      }

      return tx.task.update({
        where: { id },
        data: {
          status: TaskStatus.IN_PROGRESS,
          ...(overQuota ? { maxRevisions: { increment: 1 }, revisionsUsed: { increment: 1 } } : {}),
        },
        include: {
          deliverables: { orderBy: { version: "desc" } },
          revisionRequests: { orderBy: { round: "desc" } },
        },
      });
    });
  }

  /**
   * Staff's call on *why* a revision was requested -- billable (the client
   * asked for something new/out of scope, counts against their included
   * revisions) or free (Kravio's own mistake, doesn't). This is the only
   * thing that ever changes `Task.revisionsUsed` now (see
   * requestRevision()'s comment) -- computed as a delta from the request's
   * previous classification to its new one, so staff correcting an earlier
   * call adjusts the count instead of only ever being able to add to it.
   */
  async classifyRevisionRequest(
    taskId: string,
    revisionRequestId: string,
    staffUserId: string,
    dto: ClassifyRevisionDto,
  ) {
    const task = await this.findOne(taskId);
    const revisionRequest = task.revisionRequests.find((r) => r.id === revisionRequestId);
    if (!revisionRequest) throw new NotFoundException("Revision request not found for this task");

    const wasBillable = revisionRequest.billable === true;
    const delta = (dto.billable ? 1 : 0) - (wasBillable ? 1 : 0);

    return this.prisma.runAsTenant(task.organizationId, async (tx) => {
      await tx.revisionRequest.update({
        where: { id: revisionRequestId },
        data: {
          billable: dto.billable,
          classifiedById: staffUserId,
          classifiedAt: new Date(),
          classificationNote: dto.note,
        },
      });
      // increment: 0 when the classification didn't actually change (e.g.
      // re-submitting the same decision) -- a harmless no-op, simpler than
      // conditionally omitting the field.
      return tx.task.update({
        where: { id: taskId },
        data: { revisionsUsed: { increment: delta } },
        include: {
          deliverables: { orderBy: { version: "desc" } },
          revisionRequests: { orderBy: { round: "desc" } },
        },
      });
    });
  }

  /** Client signs off -- the final, human-made deliverable is accepted. */
  async approve(id: string, user: AuthenticatedUser) {
    const task = await this.findOne(id);
    await assertClientOwnsProject(this.prisma, task.projectId, user);
    if (task.status !== TaskStatus.IN_REVIEW) {
      throw new BadRequestException("Only a task currently in review can be approved.");
    }
    return this.prisma.client.task.update({
      where: { id },
      data: { status: TaskStatus.DONE },
      include: {
        deliverables: { orderBy: { version: "desc" } },
        revisionRequests: { orderBy: { round: "desc" } },
      },
    });
  }
}
