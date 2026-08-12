import { Body, Controller, Get, Param, Post, Query, Sse } from "@nestjs/common";
import { Observable } from "rxjs";
import { MessageEvent } from "@nestjs/common";
import { Role } from "@prisma/client";
import { BriefsService } from "./briefs.service";
import { CreateBriefDto } from "./dto/create-brief.dto";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";

@Controller("briefs")
export class BriefsController {
  constructor(private readonly briefsService: BriefsService) {}

  // CLIENT_APPROVER can submit their own brief now that there's a portal
  // for them to do it from -- CLIENT_VIEWER stays excluded (viewing is not
  // deciding, same rule tasks.controller.ts already follows for approvals).
  @Roles(Role.AGENCY_ADMIN, Role.AGENCY_EDITOR, Role.CLIENT_APPROVER)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBriefDto) {
    return this.briefsService.create(user, dto);
  }

  @Get()
  findAll(@Query("projectId") projectId?: string) {
    return this.briefsService.findAll(projectId);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.briefsService.findOne(id);
  }

  @Roles(Role.AGENCY_ADMIN, Role.AGENCY_EDITOR)
  @Sse(":id/generate")
  generate(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser): Observable<MessageEvent> {
    return this.briefsService.generateStream(id, user);
  }

  // Staff-only: a client submits the brief, but pricing it is the agency's
  // call to make (and to spend AI credit on) before anything is sent back.
  @Roles(Role.AGENCY_ADMIN, Role.AGENCY_EDITOR)
  @Post(":id/suggest-price")
  suggestPrice(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.briefsService.suggestPrice(id, user);
  }
}
