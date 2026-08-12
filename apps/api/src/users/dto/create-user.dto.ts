import { IsEmail, IsIn, MinLength } from "class-validator";
import { Role } from "@prisma/client";

// Deliberately narrower than the Role enum -- this endpoint provisions
// client logins for the portal. Inviting more agency staff goes through
// their own onboarding (today: a fresh /auth/signup), not this one.
const INVITABLE_ROLES = [Role.CLIENT_APPROVER, Role.CLIENT_VIEWER] as const;

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @MinLength(1)
  name!: string;

  @IsIn(INVITABLE_ROLES)
  role!: (typeof INVITABLE_ROLES)[number];
}
