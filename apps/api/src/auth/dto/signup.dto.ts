import { IsEmail, IsString, MinLength } from "class-validator";

export class SignupDto {
  @IsString()
  @MinLength(2)
  orgName!: string;

  @IsString()
  @MinLength(2)
  adminName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
