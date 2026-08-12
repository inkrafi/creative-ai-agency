import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../notifications/email.service";
import { CreateProjectDto } from "./dto/create-project.dto";
import { UpdateProjectDto } from "./dto/update-project.dto";
import { CreatePaymentDto } from "./dto/create-payment.dto";
import { ClaimPaymentDto } from "./dto/claim-payment.dto";
import { VerifyPaymentDto } from "./dto/verify-payment.dto";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";

/** Derived, never stored -- see Payment's schema comment on why paid-so-far is SUM(payments), not a balance column. */
export type PaymentStatus = "NO_PRICE" | "UNPAID" | "PARTIAL" | "PAID";

function paymentStatusFor(totalPriceIdr: number | null, totalPaidIdr: number): PaymentStatus {
  if (totalPriceIdr === null) return "NO_PRICE";
  if (totalPaidIdr <= 0) return "UNPAID";
  if (totalPaidIdr < totalPriceIdr) return "PARTIAL";
  return "PAID";
}

/** Only a VERIFIED payment counts as money actually confirmed in hand -- PENDING/REJECTED claims must never inflate this. */
function sumVerified(payments: { amountIdr: number; verificationStatus: string }[]): number {
  return payments.filter((p) => p.verificationStatus === "VERIFIED").reduce((sum, p) => sum + p.amountIdr, 0);
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  // None of these methods filter by organizationId themselves -- RLS does
  // that at the DB layer for every statement issued through prisma.client.
  // A missing `where: { organizationId }` here is not a tenant-isolation bug.

  create(organizationId: string, dto: CreateProjectDto) {
    return this.prisma.client.project.create({
      data: { organizationId, name: dto.name, description: dto.description },
    });
  }

  async findAll() {
    const projects = await this.prisma.client.project.findMany({
      orderBy: { createdAt: "desc" },
      include: { payments: true },
    });
    // Same derivation as findOne(), applied per row -- the list/finance
    // views need payment status without an N+1 findOne() per project.
    // `payments` stays on the returned object (not just used to derive
    // totalPaidIdr) -- callers like the finance dashboard flatten payments
    // across projects for a combined recent-activity view.
    return projects.map((project) => {
      const totalPaidIdr = sumVerified(project.payments);
      return { ...project, totalPaidIdr, paymentStatus: paymentStatusFor(project.totalPriceIdr, totalPaidIdr) };
    });
  }

  /**
   * Org-wide counters for the dashboard overview -- deliberately just four
   * numbers, not a general-purpose reporting endpoint. `outstandingIdr` only
   * counts projects with a price actually set (NO_PRICE contributes 0, not
   * a phantom debt) and floors each project's remainder at 0 so an
   * over-recorded payment can't produce a negative "amount owed" that would
   * silently net against what other clients owe.
   */
  async getSummary() {
    const [activeProjects, tasksInReview, projects] = await Promise.all([
      this.prisma.client.project.count({ where: { status: "ACTIVE" } }),
      this.prisma.client.task.count({ where: { status: "IN_REVIEW" } }),
      this.prisma.client.project.findMany({ include: { payments: true } }),
    ]);

    let totalRevenueIdr = 0;
    let outstandingIdr = 0;
    for (const project of projects) {
      const paid = sumVerified(project.payments);
      totalRevenueIdr += paid;
      if (project.totalPriceIdr !== null) {
        outstandingIdr += Math.max(0, project.totalPriceIdr - paid);
      }
    }

    return { activeProjects, tasksInReview, totalRevenueIdr, outstandingIdr };
  }

  async findOne(id: string) {
    const project = await this.prisma.client.project.findUnique({
      where: { id },
      include: { payments: { orderBy: { createdAt: "desc" } } },
    });
    if (!project) throw new NotFoundException("Project not found");

    const totalPaidIdr = sumVerified(project.payments);
    return {
      ...project,
      totalPaidIdr,
      paymentStatus: paymentStatusFor(project.totalPriceIdr, totalPaidIdr),
    };
  }

  async update(id: string, dto: UpdateProjectDto) {
    await this.findOne(id);
    await this.prisma.client.project.update({ where: { id }, data: dto });
    // Re-fetch through findOne() rather than returning the bare update()
    // result, so the response always carries totalPaidIdr/paymentStatus --
    // callers (e.g. setting totalPriceIdr) need the recomputed status
    // immediately, not a shape that's missing those fields on this one path.
    return this.findOne(id);
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
   * project with no agreed total wouldn't mean anything yet. Staff already
   * confirmed the money arrived before recording it, so this defaults to
   * VERIFIED (the Payment model's schema default) -- no verification step
   * needed, unlike claimPayment() below.
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

  /**
   * The client-facing counterpart to recordPayment() -- a client asserts a
   * payment happened and attaches proof, but it's PENDING (excluded from
   * totalPaidIdr) until a staff member checks the image against what was
   * expected and calls verifyPayment(). `recordedById` is the client's own
   * user id here; there's no separate "submitted by" column since the
   * meaning (whoever is asserting this payment happened) is the same one
   * recordPayment() already captures.
   */
  async claimPayment(projectId: string, clientUserId: string, dto: ClaimPaymentDto) {
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
        recordedById: clientUserId,
        proofImageUrl: dto.proofImageBase64,
        verificationStatus: "PENDING",
      },
    });

    return this.findOne(projectId);
  }

  /** Staff-only decision on a client's claimed payment -- see claimPayment(). */
  async verifyPayment(projectId: string, paymentId: string, staffUserId: string, dto: VerifyPaymentDto) {
    const payment = await this.prisma.client.payment.findUnique({ where: { id: paymentId } });
    if (!payment || payment.projectId !== projectId) {
      throw new NotFoundException("Payment not found for this project");
    }

    await this.prisma.client.payment.update({
      where: { id: paymentId },
      data: { verificationStatus: dto.decision, verifiedById: staffUserId, verifiedAt: new Date() },
    });

    return this.findOne(projectId);
  }

  async getInvoices(projectId: string) {
    return this.prisma.client.invoice.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * The one action that actually sets a project's official price --
   * BriefsService.suggestPrice() only ever produces a suggestion staff can
   * ignore or edit. Kept as its own Invoice row (not just overwriting
   * Project fields) so a later re-invoice at a corrected price doesn't
   * lose the historical amount. Email delivery is best-effort: a failed or
   * skipped send (no client account provisioned yet, or RESEND_API_KEY
   * unset) does not fail the request -- the invoice still exists and is
   * visible in-portal.
   */
  async sendInvoice(projectId: string, staffUserId: string, dto: CreateInvoiceDto) {
    const project = await this.findOne(projectId);

    const invoice = await this.prisma.client.invoice.create({
      data: {
        organizationId: project.organizationId,
        projectId,
        briefId: dto.briefId,
        amountIdr: dto.amountIdr,
        minDpPercent: dto.minDpPercent,
        createdById: staffUserId,
      },
    });

    await this.prisma.client.project.update({
      where: { id: projectId },
      data: { totalPriceIdr: dto.amountIdr, minDpPercent: dto.minDpPercent },
    });

    const recipients = await this.prisma.client.user.findMany({
      where: { role: Role.CLIENT_APPROVER },
      select: { email: true, name: true },
    });

    let anySent = false;
    for (const recipient of recipients) {
      const sent = await this.email.sendInvoiceEmail({
        to: recipient.email,
        clientName: recipient.name,
        projectName: project.name,
        amountIdr: dto.amountIdr,
        minDpPercent: dto.minDpPercent ?? null,
        portalUrl: process.env.CLIENT_PORTAL_URL ?? "http://localhost:3002",
      });
      anySent = anySent || sent;
    }

    if (anySent) {
      await this.prisma.client.invoice.update({ where: { id: invoice.id }, data: { emailSentAt: new Date() } });
    }

    return this.getInvoices(projectId);
  }
}
