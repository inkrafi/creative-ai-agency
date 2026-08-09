import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

// AuthBypassPrismaService is deliberately NOT provided here. It lives in its
// own AuthPrismaModule (see auth-prisma.module.ts) so that only AuthModule
// can import it -- keeping the one intentional RLS bypass in the system
// reachable from a single, reviewable place instead of DI-global.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
