import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ProjectsService } from "./projects.service";
import { CreateProjectDto } from "./dto/create-project.dto";
import { UpdateProjectDto } from "./dto/update-project.dto";
import { CreatePaymentDto } from "./dto/create-payment.dto";
import { ClaimPaymentDto } from "./dto/claim-payment.dto";
import { VerifyPaymentDto } from "./dto/verify-payment.dto";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { Role } from "@prisma/client";

@Controller("projects")
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  // CLIENT_APPROVER can now create their own project (self-service) --
  // ProjectsService.create() sets clientOwnerId automatically from the
  // caller, never client-supplied.
  @Roles(Role.AGENCY_ADMIN, Role.AGENCY_EDITOR, Role.CLIENT_APPROVER)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(user.tenantId, dto, user);
  }

  // Role-aware inside the service: staff see every project in the org
  // (unchanged), a client sees only projects they own.
  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.projectsService.findAll(user);
  }

  // Staff-only: an org-wide aggregate, never meant for a single client's
  // eyes -- see client-project-access.ts's isolation rationale.
  // Must stay ABOVE @Get(":id") -- Nest matches routes in declaration
  // order for a given method, so "summary" would otherwise be captured as
  // the :id param and 404 against ProjectsService.findOne().
  @Roles(Role.AGENCY_ADMIN, Role.AGENCY_EDITOR)
  @Get("summary")
  getSummary() {
    return this.projectsService.getSummary();
  }

  @Get(":id")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.projectsService.findOneForClient(id, user);
  }

  @Roles(Role.AGENCY_ADMIN, Role.AGENCY_EDITOR)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(id, dto);
  }

  @Roles(Role.AGENCY_ADMIN)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.projectsService.remove(id);
  }

  // Staff-only, same reasoning as ProjectsController.update: a client can
  // see payment status (findOne is open to every authenticated tenant
  // member), but recording that money actually arrived is a staff
  // bookkeeping action, not something a client self-reports.
  @Roles(Role.AGENCY_ADMIN, Role.AGENCY_EDITOR)
  @Post(":id/payments")
  recordPayment(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePaymentDto,
  ) {
    return this.projectsService.recordPayment(id, user.userId, dto);
  }

  // The client-facing counterpart to recordPayment() above -- creates a
  // PENDING claim, not a confirmed one. Only CLIENT_APPROVER: viewing is
  // not deciding, same rule tasks.controller.ts already follows. Ownership
  // (this client's own project, not some other client's) is checked inside
  // the service.
  @Roles(Role.CLIENT_APPROVER)
  @Post(":id/payments/claim")
  claimPayment(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ClaimPaymentDto,
  ) {
    return this.projectsService.claimPayment(id, user, dto);
  }

  // Staff-only: approving/rejecting a client's claimed payment.
  @Roles(Role.AGENCY_ADMIN, Role.AGENCY_EDITOR)
  @Patch(":id/payments/:paymentId/verify")
  verifyPayment(
    @Param("id") id: string,
    @Param("paymentId") paymentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VerifyPaymentDto,
  ) {
    return this.projectsService.verifyPayment(id, paymentId, user.userId, dto);
  }

  // Open to every role, like other reads -- both portals need invoice
  // history. Ownership checked inside the service for client callers.
  @Get(":id/invoices")
  getInvoices(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.projectsService.getInvoices(id, user);
  }

  // Staff-only: this is what actually sets the project's official price.
  @Roles(Role.AGENCY_ADMIN, Role.AGENCY_EDITOR)
  @Post(":id/invoices")
  sendInvoice(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateInvoiceDto,
  ) {
    return this.projectsService.sendInvoice(id, user, dto);
  }
}
