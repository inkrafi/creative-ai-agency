import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ClsModule } from "nestjs-cls";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import { UsersModule } from "./users/users.module";
import { ProjectsModule } from "./projects/projects.module";
import { TasksModule } from "./tasks/tasks.module";
import { BriefsModule } from "./briefs/briefs.module";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { TenantContextGuard } from "./common/guards/tenant-context.guard";
import { RolesGuard } from "./common/guards/roles.guard";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    PrismaModule,
    AuthModule,
    OrganizationsModule,
    UsersModule,
    ProjectsModule,
    TasksModule,
    BriefsModule,
  ],
  providers: [
    // Order matters: JwtAuthGuard populates req.user, TenantContextGuard reads
    // req.user into CLS for the Prisma RLS extension, RolesGuard checks
    // @Roles() metadata against req.user.role. Nest runs APP_GUARD providers
    // in registration order.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantContextGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
