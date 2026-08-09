import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * Narrow, intentional RLS bypass. Backed by the `app_auth_bypass` Postgres
 * role (BYPASSRLS, see 0002_rls_policies migration). Injected ONLY into
 * AuthModule/AuthService -- never into ProjectsService, TasksService, etc.
 * Exposes exactly the two lookups that legitimately need to run before a
 * tenant is known: which org does this email belong to, and is this email
 * already taken. Keeping the surface this small is what makes the one
 * intentional bypass in the system reviewable at a glance.
 */
@Injectable()
export class AuthBypassPrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly client: PrismaClient;

  constructor() {
    this.client = new PrismaClient({
      datasourceUrl: process.env.DATABASE_URL_AUTH_BYPASS,
    });
  }

  async findUserByEmail(email: string) {
    return this.client.user.findUnique({ where: { email } });
  }

  async emailExists(email: string): Promise<boolean> {
    const count = await this.client.user.count({ where: { email } });
    return count > 0;
  }

  async onModuleInit() {
    await this.client.$connect();
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
