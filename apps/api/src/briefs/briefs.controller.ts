import { Body, Controller, Get, Param, Patch, Post, Query, Sse } from "@nestjs/common";
import { Observable } from "rxjs";
import { MessageEvent } from "@nestjs/common";
import { Role } from "@prisma/client";
import { BriefsService } from "./briefs.service";
import { CreateBriefDto } from "./dto/create-brief.dto";
import { UpdateBriefDto } from "./dto/update-brief.dto";
import { RequestClarificationDto } from "./dto/request-clarification.dto";
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
  findAll(@CurrentUser() user: AuthenticatedUser, @Query("projectId") projectId?: string) {
    return this.briefsService.findAll(user, projectId);
  }

  @Get(":id")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.briefsService.findOneForClient(id, user);
  }

  // Client's response to a clarification request -- CLIENT_APPROVER only
  // (deciding what the brief now says, not just viewing it), same rule as
  // create(). Ownership + needsClarification are both checked in the
  // service.
  @Roles(Role.CLIENT_APPROVER)
  @Patch(":id")
  update(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateBriefDto) {
    return this.briefsService.update(id, user, dto);
  }

  // Staff-only: sends the brief back to the client with a question instead
  // of pricing something too vague to estimate.
  @Roles(Role.AGENCY_ADMIN, Role.AGENCY_EDITOR)
  @Patch(":id/request-clarification")
  requestClarification(@Param("id") id: string, @Body() dto: RequestClarificationDto) {
    return this.briefsService.requestClarification(id, dto);
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
