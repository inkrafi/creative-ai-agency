import { Body, Controller, Get, Post } from "@nestjs/common";
import { Role } from "@prisma/client";
import { UsersService } from "./users.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { CurrentUser, AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  list() {
    return this.usersService.listForCurrentTenant();
  }

  // Admin-only, not AGENCY_EDITOR too -- provisioning a client login is an
  // account-management action, a narrower circle than day-to-day project work.
  @Roles(Role.AGENCY_ADMIN)
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateUserDto) {
    return this.usersService.create(user, dto);
  }
}
