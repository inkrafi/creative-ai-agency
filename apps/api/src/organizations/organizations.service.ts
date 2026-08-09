import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * No `where` clause beyond `id` is needed: RLS scopes this to the caller's
   * own tenant automatically, so `findUnique` can only ever return the
   * caller's organization or null.
   */
  async getCurrent(organizationId: string) {
    const org = await this.prisma.client.organization.findUnique({
      where: { id: organizationId },
    });
    if (!org) throw new NotFoundException("Organization not found");
    return org;
  }
}
