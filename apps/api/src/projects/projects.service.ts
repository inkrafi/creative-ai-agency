import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateProjectDto } from "./dto/create-project.dto";
import { UpdateProjectDto } from "./dto/update-project.dto";
import { CreatePaymentDto } from "./dto/create-payment.dto";

/** Derived, never stored -- see Payment's schema comment on why paid-so-far is SUM(payments), not a balance column. */
export type PaymentStatus = "NO_PRICE" | "UNPAID" | "PARTIAL" | "PAID";

function paymentStatusFor(totalPriceIdr: number | null, totalPaidIdr: number): PaymentStatus {
  if (totalPriceIdr === null) return "NO_PRICE";
  if (totalPaidIdr <= 0) return "UNPAID";
  if (totalPaidIdr < totalPriceIdr) return "PARTIAL";
  return "PAID";
}

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
    const project = await this.prisma.client.project.findUnique({
      where: { id },
      include: { payments: { orderBy: { createdAt: "desc" } } },
    });
    if (!project) throw new NotFoundException("Project not found");

    const totalPaidIdr = project.payments.reduce((sum, p) => sum + p.amountIdr, 0);
    return {
      ...project,
      totalPaidIdr,
      paymentStatus: paymentStatusFor(project.totalPriceIdr, totalPaidIdr),
    };
  }

  async update(id: string, dto: UpdateProjectDto) {
    await this.findOne(id);
    return this.prisma.client.project.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.client.project.delete({ where: { id } });
  }

  /**
   * Manual bookkeeping entry -- see Payment's schema comment. No ordering
   * or exclusivity enforced between DP/PELUNASAN/OTHER: this records what a
   * staff member says came in, for a client relationship the agency
   * already manages outside this system. The one thing it does check is
   * that a price has actually been set -- recording a payment against a
   * project with no agreed total wouldn't mean anything yet.
   */
  async recordPayment(projectId: string, recordedById: string, dto: CreatePaymentDto) {
    const project = await this.findOne(projectId);
    if (project.totalPriceIdr === null) {
      throw new BadRequestException("Set the project's totalPriceIdr before recording a payment against it.");
    }

    await this.prisma.client.payment.create({
      data: {
        organizationId: project.organizationId,
        projectId,
        type: dto.type,
        amountIdr: dto.amountIdr,
        method: dto.method,
        note: dto.note,
        recordedById,
      },
    });

    return this.findOne(projectId);
  }
}
