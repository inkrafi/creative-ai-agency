import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ClsService } from "nestjs-cls";
import { Prisma, PrismaClient } from "@prisma/client";

type ExtendedPrismaClient = ReturnType<PrismaService["buildExtendedClient"]>;

/**
 * Every feature module injects PrismaService and calls `prisma.client`.
 * The unextended `base` client is private on purpose: it is only used
 * internally to open the interactive transaction that SET LOCAL rides on,
 * and by runAsTenant() for contexts where no HTTP request/CLS exists yet
 * (signup, seed scripts, isolation tests).
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly base: PrismaClient;
  public readonly client: ExtendedPrismaClient;

  constructor(private readonly cls: ClsService) {
    this.base = new PrismaClient({
      datasourceUrl: process.env.DATABASE_URL, // app_rls role, RLS-restricted
    });
    this.client = this.buildExtendedClient();
  }

  private buildExtendedClient() {
    const base = this.base;
    const cls = this.cls;

    return base.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            const tenantId = cls.get<string | undefined>("tenantId");

            if (!tenantId) {
              // No tenant context on this async chain -- e.g. a route that
              // should have been @Public(), or a genuine bug. Run the query
              // anyway rather than throwing: RLS with no SET LOCAL fails
              // CLOSED (zero rows visible/writable), never fails open. See
              // the 0002_rls_policies migration comment for why.
              return query(args);
            }

            // Own transaction per call: `$transaction` on the callback form
            // pins one physical connection for its duration, which SET LOCAL
            // requires (it's transaction-scoped). Deliberately calling
            // base.$transaction, not this.client's, to avoid recursing back
            // into this same extension.
            return base.$transaction(async (tx) => {
              await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
              return (tx as unknown as Record<string, any>)[model as string][operation](args);
            });
          },
        },
      },
    });
  }

  /**
   * Runs `fn` under an explicit tenant context, bypassing CLS entirely.
   * Used by:
   *  - AuthService.signup, to create the very first Organization + User
   *    row (no JWT/tenant context exists yet -- the org id being created
   *    IS the tenant id, so WITH CHECK is satisfied without a bypass role).
   *  - prisma/seed.ts.
   *  - isolation e2e tests, to seed fixtures for two different tenants and
   *    to prove RLS blocks raw cross-tenant queries directly (not just app code).
   */
  async runAsTenant<T>(
    tenantId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<T> {
    return this.base.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
        return fn(tx);
      },
      options?.isolationLevel ? { isolationLevel: options.isolationLevel } : undefined,
    );
  }

  /** Escape hatch for isolation tests that need to prove "no context set = zero rows". */
  get rawBase(): PrismaClient {
    return this.base;
  }

  async onModuleInit() {
    await this.base.$connect();
  }

  async onModuleDestroy() {
    await this.base.$disconnect();
  }
}
