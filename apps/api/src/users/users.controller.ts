import { Body, Controller, Get, Patch, Post } from "@nestjs/common";
import { Role } from "@prisma/client";
import { UsersService } from "./users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  list() {
    return this.usersService.listForCurrentTenant();
  }

  // Static "me" routes -- must stay ABOVE any future GET/PATCH ":id" route,
  // same reasoning as ProjectsController's "summary" route comment.
  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findMe(user.userId);
  }

  @Patch("me")
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateMe(user.userId, dto);
  }

  @Patch("me/password")
  changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto) {
    return this.usersService.changePassword(user.userId, dto);
  }

  // Admin-only, not AGENCY_EDITOR too -- provisioning a client login is an
  // account-management action, a narrower circle than day-to-day project work.
  @Roles(Role.AGENCY_ADMIN)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateUserDto) {
    return this.usersService.create(user, dto);
  }
}
