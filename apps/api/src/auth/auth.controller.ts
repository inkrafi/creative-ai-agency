import { Body, Controller, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { SignupDto } from "./dto/signup.dto";
import { ClientSignupDto } from "./dto/client-signup.dto";
import { LoginDto } from "./dto/login.dto";
import { Public } from "../common/decorators/public.decorator";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post("signup")
  signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  // Client-facing registration -- joins the fixed Kravio org, not a new
  // one. See AuthService.clientSignup().
  @Public()
  @Post("client-signup")
  clientSignup(@Body() dto: ClientSignupDto) {
    return this.authService.clientSignup(dto);
  }

  @Public()
  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
