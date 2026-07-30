import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import type { ApiError } from '@rating-pro/shared';

/**
 * Normaliza toda resposta de erro no formato `ApiError` do shared, para o
 * frontend ter um único caminho de tratamento.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const body = this.toApiError(exception);

    if (body.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${body.statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(body.statusCode).json(body);
  }

  private toApiError(exception: unknown): ApiError {
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      const status = exception.getStatus();

      if (typeof payload === 'string') {
        return { statusCode: status, message: payload };
      }

      const record = payload as Record<string, unknown>;
      const rawMessage = record['message'];

      return {
        statusCode: status,
        message: Array.isArray(rawMessage)
          ? rawMessage.join('; ')
          : typeof rawMessage === 'string'
            ? rawMessage
            : exception.message,
        ...(record['errors'] ? { errors: record['errors'] as Record<string, string[]> } : {}),
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromKnownPrismaError(exception);
    }

    /*
     * Regras aplicadas por trigger (limite de masters, máquina de estados,
     * guarda de escalada de privilégio) levantam `raise exception` no Postgres.
     * O Prisma não mapeia esses códigos, então eles chegam aqui como
     * PrismaClientUnknownRequestError — e, sem este ramo, virariam um 500
     * opaco em vez da mensagem de negócio que o banco já escreveu em português.
     */
    if (exception instanceof Prisma.PrismaClientUnknownRequestError) {
      const fromDb = this.fromPostgresError(exception.message);
      if (fromDb) return fromDb;
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Erro interno no servidor',
    };
  }

  private fromKnownPrismaError(error: Prisma.PrismaClientKnownRequestError): ApiError {
    switch (error.code) {
      case 'P2002':
        return { statusCode: HttpStatus.CONFLICT, message: 'Registro duplicado' };
      case 'P2003':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Referência inválida para um registro relacionado',
        };
      case 'P2025':
        return { statusCode: HttpStatus.NOT_FOUND, message: 'Registro não encontrado' };
      default:
        break;
    }

    // P2010 (raw query) também embrulha a mensagem original do Postgres.
    return (
      this.fromPostgresError(error.message) ?? {
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'Operação rejeitada pelo banco de dados',
      }
    );
  }

  /**
   * Extrai `code` e `message` do erro cru do Postgres embrulhado pelo Prisma e
   * traduz o SQLSTATE para o status HTTP correspondente.
   *
   * São dois formatos diferentes, dependendo de como a query foi feita:
   *   ORM  -> PostgresError { code: "23514", message: "..." }
   *   raw  -> Raw query failed. Code: `23514`. Message: `...`
   * Todo o caminho de autenticação usa $queryRaw, então o segundo formato não é
   * caso de canto.
   */
  private fromPostgresError(raw: string): ApiError | null {
    const message =
      /message: "((?:[^"\\]|\\.)+)"/.exec(raw)?.[1] ?? /Message: `([^`]+)`/.exec(raw)?.[1];

    if (!message) return null;

    const code = /code: "(\w+)"/.exec(raw)?.[1] ?? /Code: `(\w+)`/.exec(raw)?.[1];

    const statusByCode: Record<string, number> = {
      '23514': HttpStatus.CONFLICT, // check_violation — nossas regras de trigger
      '23505': HttpStatus.CONFLICT, // unique_violation
      '23503': HttpStatus.BAD_REQUEST, // foreign_key_violation
      '23502': HttpStatus.BAD_REQUEST, // not_null_violation
      '42501': HttpStatus.FORBIDDEN, // insufficient_privilege
      '28000': HttpStatus.UNAUTHORIZED, // invalid_authorization
    };

    return {
      statusCode: (code ? statusByCode[code] : undefined) ?? HttpStatus.CONFLICT,
      message: message.replace(/\\"/g, '"'),
    };
  }
}
