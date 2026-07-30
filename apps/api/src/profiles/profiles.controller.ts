import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  adminSetPasswordSchema,
  adminUpdateProfileSchema,
  updateProfileSchema,
  type AdminSetPasswordInput,
  type AdminUpdateProfileInput,
  type UpdateProfileInput,
} from '@rating-pro/shared';
import { AuthService } from '../auth/auth.service';
import { CurrentUser, Roles } from '../common/decorators';
import type { AuthenticatedUser } from '../common/types';
import { zodPipe } from '../common/zod-validation.pipe';
import { listProfilesQuerySchema, type ListProfilesQuery } from './profiles.query';
import { ProfilesService } from './profiles.service';

@ApiTags('profiles')
@ApiBearerAuth()
@Controller()
export class ProfilesController {
  constructor(
    private readonly profiles: ProfilesService,
    private readonly auth: AuthService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Perfil do usuário autenticado' })
  findMe(@CurrentUser() user: AuthenticatedUser) {
    return this.profiles.findMe(user);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Atualiza os dados cadastrais do próprio perfil' })
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodPipe(updateProfileSchema)) input: UpdateProfileInput,
  ) {
    return this.profiles.updateMe(user, input);
  }

  @Roles('master')
  @Get('profiles')
  @ApiOperation({ summary: 'Lista perfis (master)' })
  list(@Query(zodPipe(listProfilesQuerySchema)) query: ListProfilesQuery) {
    return this.profiles.list(query);
  }

  @Roles('master')
  @Get('profiles/:id')
  @ApiOperation({ summary: 'Detalhe de um perfil (master)' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.profiles.findByIdOrFail(id);
  }

  @Roles('master')
  @Patch('profiles/:id')
  @ApiOperation({ summary: 'Altera papel, status ou comissão (master)' })
  adminUpdate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(adminUpdateProfileSchema)) input: AdminUpdateProfileInput,
  ) {
    return this.profiles.adminUpdate(id, input);
  }

  /**
   * Substitui o fluxo de "esqueci minha senha" por e-mail: sem provedor de
   * e-mail no ambiente, quem redefine é um master.
   */
  @Roles('master')
  @Patch('profiles/:id/password')
  @ApiOperation({ summary: 'Redefine a senha de um usuário (master)' })
  async setPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodPipe(adminSetPasswordSchema)) input: AdminSetPasswordInput,
  ) {
    await this.profiles.findByIdOrFail(id);
    await this.auth.setPassword(id, input.password);

    return { message: 'Senha redefinida com sucesso.' };
  }
}
