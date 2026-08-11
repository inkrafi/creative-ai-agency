import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ProjectsService } from "./projects.service";
import { CreateProjectDto } from "./dto/create-project.dto";
import { UpdateProjectDto } from "./dto/update-project.dto";
import { CreatePaymentDto } from "./dto/create-payment.dto";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { Role } from "@prisma/client";

@Controller("projects")
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Roles(Role.AGENCY_ADMIN, Role.AGENCY_EDITOR)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(user.tenantId, dto);
  }

  @Get()
  findAll() {
    return this.projectsService.findAll();
  }

  // Must stay ABOVE @Get(":id") -- Nest matches routes in declaration
  // order for a given method, so "summary" would otherwise be captured as
  // the :id param and 404 against ProjectsService.findOne().
  @Get("summary")
  getSummary() {
    return this.projectsService.getSummary();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.projectsService.findOne(id);
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
}
