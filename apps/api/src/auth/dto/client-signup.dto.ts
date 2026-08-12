import { IsEmail, IsString, MinLength } from "class-validator";

/**
 * No orgName -- unlike SignupDto (which creates a brand-new Organization
 * for a new agency), a self-registering client joins the one, already-known
 * KRAVIO_ORGANIZATION_ID org. See AuthService.clientSignup().
 */
export class ClientSignupDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
