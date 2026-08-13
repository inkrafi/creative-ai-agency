import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { EmailService } from "../notifications/email.service";
import { AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { assertClientOwnsProject } from "../common/client-project-access";
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
  // Isolation *between different clients in the same org* is a separate,
  // app-level concern -- see client-project-access.ts.

  /**
   * clientOwnerId is set automatically for a client-created project, never
   * client-supplied -- a client can't choose to create a project "owned"
   * by someone else. Staff-created projects (unchanged from before
   * self-service existed) stay unowned until explicitly assigned (see
   * update()'s clientOwnerId handling).
   */
  create(organizationId: string, dto: CreateProjectDto, user: AuthenticatedUser) {
    const isClient = user.role === Role.CLIENT_APPROVER;
    return this.prisma.client.project.create({
      data: {
        organizationId,
        name: dto.name,
        description: dto.description,
        clientOwnerId: isClient ? user.userId : undefined,
      },
    });
  }

  async findAll(user: AuthenticatedUser) {
    const isClient = user.role === Role.CLIENT_APPROVER || user.role === Role.CLIENT_VIEWER;
    const projects = await this.prisma.client.project.findMany({
      where: isClient ? { clientOwnerId: user.userId } : undefined,
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
    const [activeProjects, tasksInReview, projects, pendingPaymentVerifications, pendingRevisionClassifications, briefsAwaitingPrice] =
      await Promise.all([
        this.prisma.client.project.count({ where: { status: "ACTIVE" } }),
        this.prisma.client.task.count({ where: { status: "IN_REVIEW" } }),
        this.prisma.client.project.findMany({ include: { payments: true } }),
        // The three "needs staff attention" counters -- surfaced on the
        // Ringkasan overview so a new brief/claim/revision doesn't sit
        // undiscovered just because no one happened to open that specific
        // project. No unified queue page yet (see README) -- these are
        // awareness, not a one-click deep link, for now.
        this.prisma.client.payment.count({ where: { verificationStatus: "PENDING" } }),
        this.prisma.client.revisionRequest.count({ where: { billable: null } }),
        this.prisma.client.brief.count({ where: { aiSuggestedPriceIdr: null } }),
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

    return {
      activeProjects,
      tasksInReview,
      totalRevenueIdr,
      outstandingIdr,
      pendingPaymentVerifications,
      pendingRevisionClassifications,
      briefsAwaitingPrice,
    };
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

  /**
   * The client-reachable counterpart to findOne() -- adds the ownership
   * check before delegating. findOne() itself stays as-is (many internal
   * staff-only callers below have no user in scope at all).
   */
  async findOneForClient(id: string, user: AuthenticatedUser) {
    await assertClientOwnsProject(this.prisma, id, user);
    return this.findOne(id);
  }

  async update(id: string, dto: UpdateProjectDto) {
    await this.findOne(id);
    await this.prisma.client.project.update({
      where: { id },
      // targetCompletionDate arrives as a plain "YYYY-MM-DD" string from
      // the DTO (an <input type="date">'s native format) -- Prisma's
      // DateTime coercion needs a full ISO-8601 datetime or a Date object,
      // not a bare date, so it's converted here rather than widening the
      // DTO's validation to demand a datetime the frontend has no reason
      // to send.
      data: {
        ...dto,
        targetCompletionDate: dto.targetCompletionDate !== undefined ? new Date(dto.targetCompletionDate) : undefined,
      },
    });
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
  async claimPayment(projectId: string, user: AuthenticatedUser, dto: ClaimPaymentDto) {
    await assertClientOwnsProject(this.prisma, projectId, user);
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
        recordedById: user.userId,
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
      data: {
        verificationStatus: dto.decision,
        verifiedById: staffUserId,
        verifiedAt: new Date(),
        verificationNote: dto.note,
      },
    });

    return this.findOne(projectId);
  }

  async getInvoices(projectId: string, user: AuthenticatedUser) {
    await assertClientOwnsProject(this.prisma, projectId, user);
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
  async sendInvoice(projectId: string, user: AuthenticatedUser, dto: CreateInvoiceDto) {
    const project = await this.findOne(projectId);

    const invoice = await this.prisma.client.invoice.create({
      data: {
        organizationId: project.organizationId,
        projectId,
        briefId: dto.briefId,
        amountIdr: dto.amountIdr,
        minDpPercent: dto.minDpPercent,
        createdById: user.userId,
      },
    });

    await this.prisma.client.project.update({
      where: { id: projectId },
      data: { totalPriceIdr: dto.amountIdr, minDpPercent: dto.minDpPercent },
    });

    // Only the project's own client -- not every CLIENT_APPROVER in the
    // org. Under the client-isolation model (see client-project-access.ts)
    // emailing every client about any invoice would leak one client's
    // pricing to every other client in the same Kravio org. A staff-created
    // project with no clientOwnerId assigned yet has no one to email --
    // that's expected, not a bug (see UpdateProjectDto's clientOwnerId).
    const recipient = project.clientOwnerId
      ? await this.prisma.client.user.findUnique({
          where: { id: project.clientOwnerId },
          select: { email: true, name: true },
        })
      : null;

    let sent = false;
    if (recipient) {
      sent = await this.email.sendInvoiceEmail({
        to: recipient.email,
        clientName: recipient.name,
        projectName: project.name,
        amountIdr: dto.amountIdr,
        minDpPercent: dto.minDpPercent ?? null,
        portalUrl: process.env.CLIENT_PORTAL_URL ?? "http://localhost:3002",
      });
    }

    if (sent) {
      await this.prisma.client.invoice.update({ where: { id: invoice.id }, data: { emailSentAt: new Date() } });
    }

    return this.getInvoices(projectId, user);
  }
}
