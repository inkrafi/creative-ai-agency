import { Module } from "@nestjs/common";
import { AuthBypassPrismaService } from "./auth-bypass-prisma.service";

// Deliberately not @Global(). Only AuthModule imports this, so
// AuthBypassPrismaService (BYPASSRLS) cannot be accidentally injected into
// ProjectsService, TasksService, or any other feature module.
@Module({
  providers: [AuthBypassPrismaService],
  exports: [AuthBypassPrismaService],
})
export class AuthPrismaModule {}
