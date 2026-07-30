import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AuthSession, ChangePasswordInput, SignInInput, SignUpInput } from '@rating-pro/shared';
import { PROFILE_STATUS_LABEL } from '@rating-pro/shared';
import type { Env } from '../config/env.validation';
import { PrismaService } from '../prisma/prisma.service';

export interface TokenPayload {
  /** id do usuário (auth.users.id / profiles.id) */
  sub: string;
  email: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Cria o usuário via `private.create_local_user`, que grava a senha em bcrypt
   * em `auth.users`. O profile aparece pelo trigger `on_auth_user_created` —
   * não inserimos aqui para não competir com ele.
   */
  async signUp(input: SignUpInput): Promise<AuthSession> {
    const metadata = {
      full_name: input.fullName,
      phone: input.phone,
      document: input.document ?? null,
      company_name: input.companyName || null,
    };

    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      select private.create_local_user(
        ${input.email},
        ${input.password},
        ${JSON.stringify(metadata)}::jsonb
      ) as id
    `;

    const id = rows[0]?.id;

    if (!id) {
      throw new ConflictException('Não foi possível criar a conta');
    }

    this.logger.log(`Revendedor cadastrado: ${input.email}`);
    return this.issueSession(id);
  }

  async signIn(input: SignInInput): Promise<AuthSession> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string | null }>>`
      select private.verify_password(${input.email}, ${input.password}) as id
    `;

    const id = rows[0]?.id ?? null;

    if (!id) {
      // Mensagem única para e-mail inexistente e senha errada: não entrega
      // quais e-mails existem na base.
      throw new UnauthorizedException('E-mail ou senha incorretos');
    }

    return this.issueSession(id);
  }

  async changePassword(userId: string, input: ChangePasswordInput): Promise<{ message: string }> {
    const profile = await this.prisma.profile.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true },
    });

    const check = await this.prisma.$queryRaw<Array<{ id: string | null }>>`
      select private.verify_password(${profile.email}, ${input.currentPassword}) as id
    `;

    if (check[0]?.id !== userId) {
      throw new UnauthorizedException('Senha atual incorreta');
    }

    await this.setPassword(userId, input.newPassword);
    return { message: 'Senha alterada com sucesso.' };
  }

  /** Usado pelo master ao redefinir a senha de um revendedor. */
  async setPassword(userId: string, password: string): Promise<void> {
    const rows = await this.prisma.$queryRaw<Array<{ ok: boolean }>>`
      select private.set_password(${userId}::uuid, ${password}) as ok
    `;

    if (!rows[0]?.ok) {
      throw new NotFoundException('Usuário não encontrado');
    }
  }

  private async issueSession(userId: string): Promise<AuthSession> {
    const profile = await this.prisma.profile.findUnique({ where: { id: userId } });

    if (!profile) {
      throw new NotFoundException('Perfil não encontrado para este usuário');
    }

    if (profile.status !== 'active') {
      throw new UnauthorizedException(
        `Conta ${PROFILE_STATUS_LABEL[profile.status].toLowerCase()}. Fale com o suporte.`,
      );
    }

    const payload: TokenPayload = { sub: profile.id, email: profile.email };
    const token = await this.jwt.signAsync(payload);

    // `exp` do próprio token, para o frontend não precisar decodificar o JWT.
    const decoded = this.jwt.decode(token) as { exp?: number } | null;
    const expiresAt = new Date((decoded?.exp ?? 0) * 1000).toISOString();

    return {
      token,
      expiresAt,
      profile: {
        ...profile,
        commissionRate: profile.commissionRate.toNumber(),
        createdAt: profile.createdAt.toISOString(),
        updatedAt: profile.updatedAt.toISOString(),
      },
    };
  }

  async verifyToken(token: string): Promise<TokenPayload | null> {
    try {
      return await this.jwt.verifyAsync<TokenPayload>(token);
    } catch {
      return null;
    }
  }

  getExpiresIn(): string {
    return this.config.get('JWT_EXPIRES_IN', { infer: true });
  }
}
