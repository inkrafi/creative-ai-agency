import { Injectable, NotFoundException } from "@nestjs/common";
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
}
