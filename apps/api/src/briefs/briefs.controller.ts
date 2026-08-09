import { Body, Controller, Get, HttpCode, Param, Post, Query, Sse } from "@nestjs/common";
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

  @Roles(Role.AGENCY_ADMIN, Role.AGENCY_EDITOR)
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

  // 202: accepted for async processing, not "created" -- the actual result
  // (the Asset) arrives later via the job:update WebSocket event, not in
  // this response body.
  @Roles(Role.AGENCY_ADMIN, Role.AGENCY_EDITOR)
  @HttpCode(202)
  @Post(":id/generate-image")
  generateImage(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.briefsService.generateImage(id, user);
  }
}
