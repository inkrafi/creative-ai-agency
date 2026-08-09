import { Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import { Server, Socket } from "socket.io";

export interface JobUpdatePayload {
  jobId: string;
  briefId: string;
  taskId: string;
  status: "PROCESSING" | "COMPLETED" | "FAILED";
  assetUrl?: string;
  errorMessage?: string;
}

interface JwtPayload {
  sub: string;
  tenantId: string;
}

/**
 * Minimal realtime slice for Phase 2: pushes generation-job status changes
 * (queued -> processing -> completed/failed) to connected clients so the UI
 * doesn't have to poll. Not general presence/comments -- there's no
 * comment/presence data model yet, so scope is job-status only; see the
 * design doc §4.2 for the fuller realtime vision this can grow into.
 *
 * Auth: Socket.io connections don't go through the HTTP Passport guard
 * pipeline, so the JWT is verified manually here from the handshake auth
 * payload (same JwtStrategy payload shape, see auth/strategies/jwt.strategy.ts)
 * rather than reusing JwtAuthGuard. Clients join a room per organizationId
 * (tenant), and every event is scoped to that room -- this is the
 * WebSocket-layer equivalent of the RLS boundary enforced elsewhere.
 */
@WebSocketGateway({ cors: { origin: "*" } })
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      client.disconnect();
      return;
    }
    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      client.join(`org:${payload.tenantId}`);
    } catch {
      this.logger.warn(`Rejected WS connection ${client.id}: invalid token`);
      client.disconnect();
    }
  }

  emitJobUpdate(organizationId: string, payload: JobUpdatePayload) {
    this.server.to(`org:${organizationId}`).emit("job:update", payload);
  }
}
