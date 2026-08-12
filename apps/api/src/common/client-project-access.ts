import { NotFoundException } from "@nestjs/common";
import { Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "./decorators/current-user.decorator";

/**
 * Isolation *between different clients of the same agency* -- a layer on
 * top of (not instead of) RLS's organization-level tenant isolation. RLS
 * already guarantees Kravio's data is invisible to anyone outside Kravio's
 * org; this guarantees one Kravio client can't see another Kravio client's
 * project just because they happen to share that same org.
 *
 * Staff roles pass through unrestricted -- ownership only constrains
 * CLIENT_APPROVER/CLIENT_VIEWER. Fails closed with 404 (not 403), same
 * philosophy as RLS itself: don't confirm to a caller that a project they
 * can't access even exists.
 *
 * Deliberately a standalone function, not baked into ProjectsService.findOne()
 * -- that method has many internal staff-only call sites (recordPayment,
 * verifyPayment, sendInvoice, ...) with no user in scope. Call this
 * explicitly at the top of client-reachable controller/service paths instead.
 */
export async function assertClientOwnsProject(
  prisma: PrismaService,
  projectId: string,
  user: AuthenticatedUser,
): Promise<void> {
  const isClient = user.role === Role.CLIENT_APPROVER || user.role === Role.CLIENT_VIEWER;
  if (!isClient) return;

  const project = await prisma.client.project.findUnique({
    where: { id: projectId },
    select: { clientOwnerId: true },
  });
  if (!project || project.clientOwnerId !== user.userId) {
    throw new NotFoundException("Project not found");
  }
}
