import { BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException } from "@nestjs/common";
import { TaskStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateTaskDto } from "./dto/create-task.dto";
import { UpdateTaskDto } from "./dto/update-task.dto";

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

  findAllForProject(projectId: string) {
    return this.prisma.client.task.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(id: string) {
    const task = await this.prisma.client.task.findUnique({ where: { id } });
    if (!task) throw new NotFoundException("Task not found");
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
   * is putting the result up for the client to look at. Not restricted to
   * @Roles(CLIENT_*) the way approve()/requestRevision() conceptually
   * should be eventually -- there's no client-facing auth yet (see design
   * doc's Client Portal, not built), so any tenant member can call this for
   * now. Revisit once that portal exists.
   */
  async submitForReview(id: string) {
    const task = await this.findOne(id);
    if (task.status === TaskStatus.DONE) {
      throw new BadRequestException("This task is already done.");
    }
    return this.prisma.client.task.update({ where: { id }, data: { status: TaskStatus.IN_REVIEW } });
  }

  /**
   * Client asks for changes. Hard-blocks once `revisionsUsed` reaches
   * `maxRevisions` -- mirrors CreditLedgerService's "check before, not
   * after" philosophy: agencies commonly include a fixed number of
   * revision rounds per brief, and unlimited free revisions is exactly the
   * kind of scope creep that quietly erodes margin. 402, not 400: this is
   * a "you've used what's included" limit, the same shape as insufficient
   * credit, not a malformed request.
   */
  async requestRevision(id: string) {
    const task = await this.findOne(id);
    if (task.status !== TaskStatus.IN_REVIEW) {
      throw new BadRequestException("Only a task currently in review can have a revision requested.");
    }
    if (task.revisionsUsed >= task.maxRevisions) {
      throw new HttpException(
        `Revision limit reached (${task.revisionsUsed}/${task.maxRevisions} used). Additional revisions need a new arrangement.`,
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return this.prisma.client.task.update({
      where: { id },
      data: { status: TaskStatus.IN_PROGRESS, revisionsUsed: { increment: 1 } },
    });
  }

  /** Client signs off -- the final, human-made deliverable is accepted. */
  async approve(id: string) {
    const task = await this.findOne(id);
    if (task.status !== TaskStatus.IN_REVIEW) {
      throw new BadRequestException("Only a task currently in review can be approved.");
    }
    return this.prisma.client.task.update({ where: { id }, data: { status: TaskStatus.DONE } });
  }
}
