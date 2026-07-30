import { Body, Controller, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  changePasswordSchema,
  signInSchema,
  signUpSchema,
  type ChangePasswordInput,
  type SignInInput,
  type SignUpInput,
} from '@rating-pro/shared';
import { CurrentUser, Public } from '../common/decorators';
import type { AuthenticatedUser } from '../common/types';
import { zodPipe } from '../common/zod-validation.pipe';
import { AuthService } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  // Cadastro é anônimo e cria usuário: limite bem mais apertado que o global.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Cadastra um revendedor e já devolve a sessão' })
  signUp(@Body(zodPipe(signUpSchema)) input: SignUpInput) {
    return this.authService.signUp(input);
  }

  @Public()
  // Freio contra tentativa de força bruta de senha.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Autentica e devolve o token de sessão' })
  signIn(@Body(zodPipe(signInSchema)) input: SignInInput) {
    return this.authService.signIn(input);
  }

  @ApiBearerAuth()
  @Patch('password')
  @ApiOperation({ summary: 'Troca a própria senha' })
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodPipe(changePasswordSchema)) input: ChangePasswordInput,
  ) {
    return this.authService.changePassword(user.id, input);
  }
}
