import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateProjectDto } from "./dto/create-project.dto";
import { UpdateProjectDto } from "./dto/update-project.dto";

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  // None of these methods filter by organizationId themselves -- RLS does
  // that at the DB layer for every statement issued through prisma.client.
  // A missing `where: { organizationId }` here is not a tenant-isolation bug.

  create(organizationId: string, dto: CreateProjectDto) {
    return this.prisma.client.project.create({
      data: { organizationId, name: dto.name, description: dto.description },
    });
  }

  findAll() {
    return this.prisma.client.project.findMany({ orderBy: { createdAt: "desc" } });
  }

  async findOne(id: string) {
    const project = await this.prisma.client.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException("Project not found");
    return project;
  }

  async update(id: string, dto: UpdateProjectDto) {
    await this.findOne(id);
    return this.prisma.client.project.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.client.project.delete({ where: { id } });
  }
}
