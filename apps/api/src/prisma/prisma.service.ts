import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Conexao unica com o Postgres.
 *
 * ATENCAO: este client autentica como `postgres`, papel com BYPASSRLS. As
 * policies de RLS do banco nao filtram nada aqui — o isolamento por revendedor
 * e feito na camada de servico via `scopeToUser()`.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Conexão com o banco estabelecida');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Ping usado pelo endpoint de health. */
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`select 1`;
      return true;
    } catch (error) {
      this.logger.error('Falha ao consultar o banco', error);
      return false;
    }
  }
}
