import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { Role } from "@prisma/client";
import { TasksService } from "./tasks.service";
import { CreateTaskDto } from "./dto/create-task.dto";
import { UpdateTaskDto } from "./dto/update-task.dto";
import { SubmitForReviewDto } from "./dto/submit-for-review.dto";
import { RequestRevisionDto } from "./dto/request-revision.dto";
import { ClassifyRevisionDto } from "./dto/classify-revision.dto";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";

/**
 * Role model here mirrors ProjectsController: agency staff own the work,
 * admin-only for destructive operations, and reads stay open to every
 * authenticated member of the tenant (that's the entire point of the
 * CLIENT_VIEWER role).
 *
 * approve/request-revision additionally allow CLIENT_APPROVER: those are
 * conceptually the *client's* decisions. Staff are still permitted because
 * there's no client-facing portal yet, so today a staff member records the
 * decision the client relayed out-of-band -- see the dev UI's "Klien
 * Setuju" / "Klien Minta Revisi" buttons. CLIENT_VIEWER is deliberately
 * excluded: viewing is not deciding.
 */
@Controller("tasks")
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Roles(Role.AGENCY_ADMIN, Role.AGENCY_EDITOR)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTaskDto) {
    return this.tasksService.create(user.tenantId, user.userId, dto);
  }

  @Get()
  findAllForProject(@Query("projectId") projectId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tasksService.findAllForProject(projectId, user);
  }

  @Get(":id")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tasksService.findOneForClient(id, user);
  }

  @Roles(Role.AGENCY_ADMIN, Role.AGENCY_EDITOR)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateTaskDto) {
    return this.tasksService.update(id, dto);
  }

  @Roles(Role.AGENCY_ADMIN)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.tasksService.remove(id);
  }

  @Roles(Role.AGENCY_ADMIN, Role.AGENCY_EDITOR)
  @Post(":id/submit-for-review")
  submitForReview(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitForReviewDto,
  ) {
    return this.tasksService.submitForReview(id, user.userId, dto);
  }

  @Roles(Role.AGENCY_ADMIN, Role.AGENCY_EDITOR, Role.CLIENT_APPROVER)
  @Post(":id/request-revision")
  requestRevision(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RequestRevisionDto,
  ) {
    return this.tasksService.requestRevision(id, user, dto);
  }

  @Roles(Role.AGENCY_ADMIN, Role.AGENCY_EDITOR, Role.CLIENT_APPROVER)
  @Post(":id/approve")
  approve(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tasksService.approve(id, user);
  }

  // Staff-only: whether a revision request counts against the client's
  // included revisions is the agency's own bookkeeping call, not the
  // client's -- see TasksService.classifyRevisionRequest().
  @Roles(Role.AGENCY_ADMIN, Role.AGENCY_EDITOR)
  @Patch(":id/revision-requests/:requestId/classify")
  classifyRevisionRequest(
    @Param("id") id: string,
    @Param("requestId") requestId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ClassifyRevisionDto,
  ) {
    return this.tasksService.classifyRevisionRequest(id, requestId, user.userId, dto);
  }
}
