import { ConflictException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import * as argon2 from "argon2";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { CreateUserDto } from "./dto/create-user.dto";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** No organizationId filter needed in the query itself -- RLS enforces it. */
  async listForCurrentTenant() {
    return this.prisma.client.user.findMany({
      select: { id: true, email: true, name: true, role: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Provisions a client login inside the caller's own tenant. No email step
   * here -- the temporary password is returned once in the response for
   * staff to relay out-of-band (WhatsApp/phone), the same way every other
   * client-facing coordination already happens in this system. Emailing a
   * password would be the actual security anti-pattern; this isn't a gap.
   *
   * Email uniqueness is a real Postgres constraint (User.email is globally
   * unique, not per-tenant), so this relies on catching P2002 rather than
   * an upfront existence check -- that check would need the RLS-bypassing
   * client, which is deliberately scoped to AuthService only (see
   * AuthBypassPrismaService's doc comment).
   */
  async create(currentUser: AuthenticatedUser, dto: CreateUserDto) {
    const temporaryPassword = randomBytes(9).toString("base64url");
    const passwordHash = await argon2.hash(temporaryPassword);

    try {
      const user = await this.prisma.client.user.create({
        data: {
          organizationId: currentUser.tenantId,
          email: dto.email,
          name: dto.name,
          role: dto.role,
          passwordHash,
        },
        select: { id: true, email: true, name: true, role: true, createdAt: true },
      });
      return { ...user, temporaryPassword };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Email already in use");
      }
      throw err;
    }
  }
}
