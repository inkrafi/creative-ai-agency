import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { AuthenticatedUser } from "../decorators/current-user.decorator";

/**
 * Runs after JwtAuthGuard. Copies the validated JWT claims into the
 * request-scoped CLS context so PrismaService's query extension can read
 * `tenantId` and issue `SET LOCAL app.tenant_id` for every DB call made
 * while handling this request -- without every service having to pass
 * tenantId around explicitly. Public routes have no req.user; this guard
 * just no-ops for them.
 */
@Injectable()
export class TenantContextGuard implements CanActivate {
  constructor(private readonly cls: ClsService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const user = req.user as AuthenticatedUser | undefined;

    if (user) {
      this.cls.set("tenantId", user.tenantId);
      this.cls.set("userId", user.userId);
      this.cls.set("role", user.role);
    }

    return true;
  }
}
