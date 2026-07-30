import { ForbiddenException, HttpStatus, type ArgumentsHost } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ApiError } from '@rating-pro/shared';
import { AllExceptionsFilter } from './all-exceptions.filter';

/** Mock mínimo de ArgumentsHost que captura status e corpo da resposta. */
function makeHost() {
  const captured: { status?: number; body?: ApiError } = {};

  const response = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: ApiError) {
      captured.body = body;
      return this;
    },
  };

  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ method: 'PATCH', url: '/api/profiles/x' }),
    }),
  } as unknown as ArgumentsHost;

  return { host, captured };
}

/** Reproduz o formato com que o Prisma embrulha um erro cru do Postgres. */
function pgError(code: string, message: string): string {
  return (
    'Invalid `prisma.profile.update()` invocation:\n' +
    'Error occurred during query execution:\n' +
    'ConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(' +
    `PostgresError { code: "${code}", message: "${message}", severity: "ERROR", ` +
    'detail: None, column: None, hint: None }), transient: false })'
  );
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  beforeAll(() => {
    // O filtro loga erros 5xx; silencia para não poluir a saída do teste.
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('preserva status e mensagem de HttpException', () => {
    const { host, captured } = makeHost();

    filter.catch(new ForbiddenException('Sem permissão'), host);

    expect(captured.status).toBe(HttpStatus.FORBIDDEN);
    expect(captured.body?.message).toBe('Sem permissão');
  });

  it('repassa o mapa de erros por campo da validação zod', () => {
    const { host, captured } = makeHost();

    filter.catch(
      new ForbiddenException({
        statusCode: 400,
        message: 'Dados inválidos',
        errors: { email: ['E-mail inválido'] },
      }),
      host,
    );

    expect(captured.body?.errors).toEqual({ email: ['E-mail inválido'] });
  });

  /*
   * Regressão: regras aplicadas por trigger chegam como
   * PrismaClientUnknownRequestError. Antes deste tratamento elas viravam 500
   * com "Erro interno no servidor", escondendo a mensagem de negócio.
   */
  it('traduz check_violation de trigger em 409 com a mensagem do banco', () => {
    const { host, captured } = makeHost();

    filter.catch(
      new Prisma.PrismaClientUnknownRequestError(
        pgError('23514', 'Limite de 2 usuarios master atingido. Rebaixe um master antes.'),
        { clientVersion: 'test' },
      ),
      host,
    );

    expect(captured.status).toBe(HttpStatus.CONFLICT);
    expect(captured.body?.message).toBe(
      'Limite de 2 usuarios master atingido. Rebaixe um master antes.',
    );
  });

  it('traduz transição de status inválida em 409 legível', () => {
    const { host, captured } = makeHost();

    filter.catch(
      new Prisma.PrismaClientUnknownRequestError(
        pgError('23514', 'Transicao de status invalida: draft -> delivered'),
        { clientVersion: 'test' },
      ),
      host,
    );

    expect(captured.status).toBe(HttpStatus.CONFLICT);
    expect(captured.body?.message).toContain('Transicao de status invalida');
  });

  it('traduz insufficient_privilege em 403', () => {
    const { host, captured } = makeHost();

    filter.catch(
      new Prisma.PrismaClientUnknownRequestError(
        pgError('42501', 'Somente um master pode alterar role, status ou comissao.'),
        { clientVersion: 'test' },
      ),
      host,
    );

    expect(captured.status).toBe(HttpStatus.FORBIDDEN);
  });

  /*
   * Regressão: $queryRaw embrulha o erro num formato diferente do ORM
   * (backticks, "Code"/"Message" capitalizados). Todo o caminho de autenticação
   * usa raw query, então este formato é o principal, não exceção.
   */
  it('traduz erro de $queryRaw (P2010) preservando a mensagem do banco', () => {
    const { host, captured } = makeHost();

    filter.catch(
      new Prisma.PrismaClientKnownRequestError(
        'Invalid `prisma.$queryRaw()` invocation:\n\n\n' +
          'Raw query failed. Code: `23514`. Message: `Já existe uma conta com este e-mail`',
        { code: 'P2010', clientVersion: 'test' },
      ),
      host,
    );

    expect(captured.status).toBe(HttpStatus.CONFLICT);
    expect(captured.body?.message).toBe('Já existe uma conta com este e-mail');
  });

  it('mapeia P2002 para 409 e P2025 para 404', () => {
    const duplicate = makeHost();
    filter.catch(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }),
      duplicate.host,
    );
    expect(duplicate.captured.status).toBe(HttpStatus.CONFLICT);

    const missing = makeHost();
    filter.catch(
      new Prisma.PrismaClientKnownRequestError('missing', { code: 'P2025', clientVersion: 'test' }),
      missing.host,
    );
    expect(missing.captured.status).toBe(HttpStatus.NOT_FOUND);
  });

  it('erro desconhecido não vaza detalhe interno', () => {
    const { host, captured } = makeHost();

    filter.catch(new Error('conexão TCP caiu em 10.0.0.5:5432'), host);

    expect(captured.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(captured.body?.message).toBe('Erro interno no servidor');
  });
});
