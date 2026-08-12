import { ConflictException, Injectable, InternalServerErrorException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { randomUUID } from "crypto";
import { Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuthBypassPrismaService } from "../prisma/auth-bypass-prisma.service";
import { SignupDto } from "./dto/signup.dto";
import { ClientSignupDto } from "./dto/client-signup.dto";
import { LoginDto } from "./dto/login.dto";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authBypass: AuthBypassPrismaService,
    private readonly jwt: JwtService,
  ) {}

  async signup(dto: SignupDto) {
    // Which tenant this email belongs to isn't known yet -- this is the one
    // legitimate use of the BYPASSRLS role outside login.
    if (await this.authBypass.emailExists(dto.email)) {
      throw new ConflictException("Email already in use");
    }

    const organizationId = randomUUID();
    const passwordHash = await argon2.hash(dto.password);
    const slug = this.slugify(dto.orgName);

    const { organization, user } = await this.prisma.runAsTenant(organizationId, async (tx) => {
      const organization = await tx.organization.create({
        data: { id: organizationId, name: dto.orgName, slug },
      });
      const user = await tx.user.create({
        data: {
          organizationId,
          email: dto.email,
          passwordHash,
          name: dto.adminName,
          role: Role.AGENCY_ADMIN,
        },
      });
      return { organization, user };
    });

    return this.issueToken({
      userId: user.id,
      tenantId: organization.id,
      role: user.role,
      email: user.email,
    });
  }

  /**
   * Self-service client registration -- joins the one, already-known
   * Kravio org (KRAVIO_ORGANIZATION_ID) as CLIENT_APPROVER, instead of
   * signup()'s "spin up a brand-new Organization" behavior. There's no
   * invite token / new-tenant flow here: this deployment is Kravio's own
   * single-tenant instance, not resold multi-agency SaaS, so the target
   * org is fixed config, not something the request chooses.
   *
   * Fails loudly if unconfigured rather than silently guessing an org --
   * picking the wrong org would put a client in the wrong client's
   * workspace, which client-project-access.ts's isolation model treats as
   * a hard boundary, not a preference.
   */
  async clientSignup(dto: ClientSignupDto) {
    const organizationId = process.env.KRAVIO_ORGANIZATION_ID;
    if (!organizationId) {
      throw new InternalServerErrorException("Client self-signup isn't configured yet.");
    }

    if (await this.authBypass.emailExists(dto.email)) {
      throw new ConflictException("Email already in use");
    }

    const passwordHash = await argon2.hash(dto.password);

    const user = await this.prisma.runAsTenant(organizationId, (tx) =>
      tx.user.create({
        data: {
          organizationId,
          email: dto.email,
          passwordHash,
          name: dto.name,
          role: Role.CLIENT_APPROVER,
        },
      }),
    );

    return this.issueToken({
      userId: user.id,
      tenantId: organizationId,
      role: user.role,
      email: user.email,
    });
  }

  async login(dto: LoginDto) {
    const user = await this.authBypass.findUserByEmail(dto.email);
    if (!user || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException("Invalid credentials");
    }

    return this.issueToken({
      userId: user.id,
      tenantId: user.organizationId,
      role: user.role,
      email: user.email,
    });
  }

  private issueToken(claims: { userId: string; tenantId: string; role: string; email: string }) {
    const accessToken = this.jwt.sign({
      sub: claims.userId,
      tenantId: claims.tenantId,
      role: claims.role,
      email: claims.email,
    });
    return { accessToken };
  }

  private slugify(name: string): string {
    const base = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    return `${base}-${randomUUID().slice(0, 8)}`;
  }
}
