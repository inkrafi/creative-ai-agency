import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { RealtimeGateway } from "./realtime.gateway";

@Module({
  // Own JwtModule.register(), not a shared export from AuthModule -- avoids
  // coupling this module to auth's module graph for one config value. Both
  // read the same JWT_SECRET env var, so there's a single source of truth
  // even though the registration is duplicated.
  imports: [JwtModule.register({ secret: process.env.JWT_SECRET })],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
