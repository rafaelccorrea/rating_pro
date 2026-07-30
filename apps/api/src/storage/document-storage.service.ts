import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.validation';

/**
 * Anexos em disco, sob `UPLOADS_DIR`, com o caminho relativo guardado em
 * `order_documents.storage_path`.
 *
 * Nao usamos o Storage do Supabase porque a API roda com autenticacao propria
 * (ver a migration `local_auth`) e nao tem chave do Supabase no ambiente — os
 * buckets criados na migration antiga ficaram sem uso. Disco local mantem o
 * deploy com uma peca a menos; o preco e precisar de volume persistente.
 *
 * O download nunca e servido por arquivo estatico: passa pelo controller, que
 * confere dono do pedido antes de abrir o stream.
 */
@Injectable()
export class DocumentStorageService {
  private readonly logger = new Logger(DocumentStorageService.name);
  private readonly root: string;

  constructor(config: ConfigService<Env, true>) {
    this.root = resolve(config.get('UPLOADS_DIR', { infer: true }));
  }

  /** Caminho relativo "<orderId>/<uuid><ext>", igual a convencao dos buckets. */
  async save(orderId: string, file: { originalname: string; buffer: Buffer }): Promise<string> {
    const dir = join(this.root, orderId);
    await mkdir(dir, { recursive: true });

    // Nome gerado, extensao herdada: o nome original vai para a coluna
    // `file_name` e nunca toca no filesystem — assim nao ha path traversal.
    const extension = extname(file.originalname).toLowerCase().slice(0, 10);
    const relative = `${orderId}/${randomUUID()}${extension}`;

    await writeFile(join(this.root, relative), file.buffer);
    this.logger.log(`Anexo gravado: ${relative} (${file.buffer.byteLength} bytes)`);

    return relative;
  }

  async remove(relativePath: string): Promise<void> {
    await rm(this.absolute(relativePath), { force: true });
  }

  async openStream(relativePath: string): Promise<ReadStream> {
    const absolute = this.absolute(relativePath);

    try {
      await stat(absolute);
    } catch {
      throw new NotFoundException('Arquivo não encontrado no armazenamento');
    }

    return createReadStream(absolute);
  }

  /** Impressao digital do conteudo, para detectar reenvio identico. */
  static checksum(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  /** Resolve dentro da raiz e recusa qualquer caminho que escape dela. */
  private absolute(relativePath: string): string {
    const absolute = resolve(this.root, relativePath);

    if (absolute !== this.root && !absolute.startsWith(this.root + sep)) {
      throw new NotFoundException('Caminho de arquivo inválido');
    }

    return absolute;
  }
}
