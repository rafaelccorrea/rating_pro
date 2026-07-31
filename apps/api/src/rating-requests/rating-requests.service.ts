import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type OrderPayment } from '@prisma/client';
import {
  ACCEPTED_DOCUMENT_MIME,
  documentSlots,
  MAX_DOCUMENT_BYTES,
  PAYMENT_METHOD_LABEL,
  requiredDocumentSlots,
  type ConfirmPaymentInput,
  type PersonType,
  type RatingRequestInput,
} from '@rating-pro/shared';
import { encryptSecret } from '../common/crypto';
import { assertOwnership } from '../common/scope';
import { isMaster, type AuthenticatedUser } from '../common/types';
import type { Env } from '../config/env.validation';
import { AsaasService } from '../integrations/asaas/asaas.service';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentStorageService } from '../storage/document-storage.service';

export interface UploadedDocument {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Status em que o pedido ainda aceita edicao de anexos pelo revendedor. */
const EDITABLE_STATUSES = ['draft', 'pending_doc'] as const;

@Injectable()
export class RatingRequestsService {
  private readonly logger = new Logger(RatingRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DocumentStorageService,
    private readonly config: ConfigService<Env, true>,
    private readonly asaas: AsaasService,
  ) {}

  /**
   * Etapas 1, 2 e 4 chegam juntas: o formulario so tem serventia inteiro, e
   * fatiar em tres requisicoes deixaria pedido orfao se a pessoa desistisse no
   * meio. Os documentos (etapa 3) sobem depois, um a um, porque sao grandes.
   *
   * O cliente e criado ou reaproveitado pelo par (revendedor, documento): a
   * mesma empresa contratando de novo nao vira cadastro duplicado.
   */
  async create(user: AuthenticatedUser, input: RatingRequestInput) {
    const resellerId = await this.resolveReseller(user, input.resellerId);
    const price = this.priceFor(input.personType);

    const result = await this.prisma.$transaction(async (tx) => {
      const client = await tx.client.upsert({
        where: {
          resellerId_document: { resellerId, document: input.document },
        },
        create: {
          resellerId,
          personType: input.personType,
          document: input.document,
          name: input.name,
          email: input.email,
          phone: input.phone,
          birthDate: new Date(input.birthDate),
        },
        update: {
          name: input.name,
          email: input.email,
          phone: input.phone,
          birthDate: new Date(input.birthDate),
        },
      });

      // Documento igual com tipo de pessoa diferente e erro de digitacao, nao
      // um cliente novo: barra em vez de sobrescrever o cadastro existente.
      if (client.personType !== input.personType) {
        throw new BadRequestException(
          'Já existe um cliente com este documento cadastrado com outro tipo de pessoa.',
        );
      }

      const order = await tx.ratingOrder.create({
        data: {
          resellerId,
          clientId: client.id,
          status: 'draft',
          saleAmount: new Prisma.Decimal(price),
        },
      });

      await tx.orderApplication.create({
        data: {
          orderId: order.id,
          maritalStatus: input.applicant.maritalStatus,
          education: input.applicant.education,
          occupation: input.applicant.occupation,
          serasaPasswordEnc: encryptSecret(
            input.applicant.serasaPassword,
            this.config.get('CREDENTIALS_KEY', { infer: true }),
          ),
        },
      });

      const payment = await tx.orderPayment.create({
        data: {
          orderId: order.id,
          method: input.paymentMethod,
          amount: new Prisma.Decimal(price),
        },
      });

      this.logger.log(`Contratação ${order.code} aberta por ${user.email} (${input.personType})`);

      return { order, payment };
    });

    // Fora da transacao de proposito: chamada HTTP nao pode segurar lock de
    // banco, e uma falha no gateway nao pode desfazer o pedido ja criado — a
    // cobranca fica pendente e a proxima visita a tela de pagamento retenta.
    const charged = await this.asaas.tryCreateCharge(result.payment.id);

    return {
      orderId: result.order.id,
      code: result.order.code,
      personType: input.personType,
      checklist: documentSlots(input.personType),
      payment: this.publicPayment(charged ?? result.payment),
    };
  }

  /**
   * Um arquivo por item do checklist. Reenviar substitui o anterior — em vez de
   * acumular versoes que ninguem sabe qual vale, o ultimo envio manda.
   */
  async attachDocument(
    user: AuthenticatedUser,
    orderId: string,
    slot: string,
    file: UploadedDocument,
  ) {
    const order = await this.loadEditableOrder(user, orderId);

    const allowed = documentSlots(order.client.personType).some((item) => item.key === slot);
    if (!allowed) {
      throw new BadRequestException(
        `"${slot}" não faz parte do checklist de ${order.client.personType.toUpperCase()}`,
      );
    }

    if (file.size > MAX_DOCUMENT_BYTES) {
      throw new BadRequestException('Arquivo acima de 15 MB');
    }

    if (!(ACCEPTED_DOCUMENT_MIME as readonly string[]).includes(file.mimetype)) {
      throw new BadRequestException('Envie PDF, JPG, PNG ou WEBP');
    }

    const previous = await this.prisma.orderDocument.findFirst({
      where: { orderId, slot },
    });

    const storagePath = await this.storage.save(orderId, file);

    const saved = await this.prisma.$transaction(async (tx) => {
      if (previous) {
        await tx.orderDocument.delete({ where: { id: previous.id } });
      }

      return tx.orderDocument.create({
        data: {
          orderId,
          slot,
          storagePath,
          fileName: file.originalname.slice(0, 200),
          mimeType: file.mimetype,
          sizeBytes: BigInt(file.size),
          uploadedBy: user.id,
        },
      });
    });

    // Fora da transacao de proposito: apagar o arquivo antigo nao pode desfazer
    // o registro novo se falhar. Sobra de disco e menos grave que anexo perdido.
    if (previous) {
      await this.storage.remove(previous.storagePath).catch((error: unknown) => {
        this.logger.warn(`Não consegui apagar ${previous.storagePath}: ${String(error)}`);
      });
    }

    return this.publicDocument(saved);
  }

  async listDocuments(user: AuthenticatedUser, orderId: string) {
    const order = await this.prisma.ratingOrder.findUnique({
      where: { id: orderId },
      select: { resellerId: true, client: { select: { personType: true } } },
    });

    if (!order) throw new NotFoundException('Pedido não encontrado');
    assertOwnership(user, order.resellerId);

    const documents = await this.prisma.orderDocument.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      checklist: documentSlots(order.client.personType),
      documents: documents.map((document) => this.publicDocument(document)),
    };
  }

  async removeDocument(user: AuthenticatedUser, orderId: string, documentId: string) {
    await this.loadEditableOrder(user, orderId);

    const document = await this.prisma.orderDocument.findFirst({
      where: { id: documentId, orderId },
    });

    if (!document) throw new NotFoundException('Anexo não encontrado');

    await this.prisma.orderDocument.delete({ where: { id: document.id } });
    await this.storage.remove(document.storagePath).catch(() => undefined);
  }

  /** Stream + metadados para o controller responder o download. */
  async openDocument(user: AuthenticatedUser, orderId: string, documentId: string) {
    const order = await this.prisma.ratingOrder.findUnique({
      where: { id: orderId },
      select: { resellerId: true },
    });

    if (!order) throw new NotFoundException('Pedido não encontrado');
    assertOwnership(user, order.resellerId);

    const document = await this.prisma.orderDocument.findFirst({
      where: { id: documentId, orderId },
    });

    if (!document) throw new NotFoundException('Anexo não encontrado');

    return {
      stream: await this.storage.openStream(document.storagePath),
      fileName: document.fileName,
      mimeType: document.mimeType,
    };
  }

  /**
   * Fecha a contratacao: confere o checklist obrigatorio e manda para analise.
   *
   * O pedido vai para `submitted` mesmo com a cobranca pendente (PIX e boleto
   * compensam depois), mas quem despacha para o analista e a confirmacao do
   * pagamento — por isso o retorno diz as duas coisas.
   */
  async submit(user: AuthenticatedUser, orderId: string) {
    const order = await this.loadEditableOrder(user, orderId);

    const documents = await this.prisma.orderDocument.findMany({
      where: { orderId },
      select: { slot: true },
    });

    const present = new Set(documents.map((document) => document.slot));
    const missing = requiredDocumentSlots(order.client.personType).filter(
      (slot) => !present.has(slot.key),
    );

    if (missing.length > 0) {
      throw new BadRequestException(
        `Faltam documentos obrigatórios: ${missing.map((slot) => slot.label).join(', ')}`,
      );
    }

    const application = await this.prisma.orderApplication.findUnique({
      where: { orderId },
      select: { orderId: true },
    });

    if (!application) {
      throw new BadRequestException('Este pedido não veio do fluxo de contratação');
    }

    const updated = await this.prisma.ratingOrder.update({
      where: { id: orderId },
      data: { status: 'submitted', submittedAt: new Date() },
      select: { id: true, code: true, status: true, trackingToken: true },
    });

    const payment = await this.prisma.orderPayment.findFirst({
      where: { orderId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });

    return {
      order: updated,
      payment: payment ? this.publicPayment(await this.withCharge(payment)) : null,
    };
  }

  /**
   * Confirmacao manual, por master. E o gancho onde entra o webhook do provedor
   * de pagamento quando houver um: mesma regra, outro disparador.
   */
  async confirmPayment(user: AuthenticatedUser, paymentId: string, input: ConfirmPaymentInput) {
    if (!isMaster(user)) {
      throw new ForbiddenException('Apenas master confirma pagamento');
    }

    const payment = await this.prisma.orderPayment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Cobrança não encontrada');

    if (payment.status === input.status) {
      return this.publicPayment(payment);
    }

    if (payment.status !== 'pending' && input.status !== 'refunded') {
      throw new BadRequestException(
        'Cobrança já fechada; só é possível registrar estorno a partir daqui',
      );
    }

    const updated = await this.prisma.orderPayment.update({
      where: { id: paymentId },
      data: {
        status: input.status,
        reference: input.reference || payment.reference,
        note: input.note || payment.note,
      },
    });

    // Pagou por fora (ou a cobrança morreu aqui): a fatura no Asaas não pode
    // continuar pagável, senão o cliente paga de novo e o webhook trata como
    // reentrega — dinheiro a mais sem registro nenhum. Estorno não entra: a
    // cobrança lá já está paga e o DELETE não se aplica.
    if (input.status !== 'refunded') {
      await this.asaas.tryCancelRemoteCharge(paymentId);
    }

    this.logger.log(`Cobrança ${paymentId} -> ${input.status} por ${user.email}`);

    return this.publicPayment(updated);
  }

  async findPayment(user: AuthenticatedUser, orderId: string) {
    const order = await this.prisma.ratingOrder.findUnique({
      where: { id: orderId },
      select: { resellerId: true },
    });

    if (!order) throw new NotFoundException('Pedido não encontrado');
    assertOwnership(user, order.resellerId);

    const payment = await this.prisma.orderPayment.findFirst({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });

    return payment ? this.publicPayment(await this.withCharge(payment)) : null;
  }

  /**
   * Garante a cobranca no Asaas de um pagamento pendente que ainda nao tem
   * uma. E o caminho de retentativa: se o gateway falhou (ou o perfil estava
   * sem CPF/CNPJ) na criacao do pedido, a proxima consulta resolve.
   */
  private async withCharge(payment: OrderPayment): Promise<OrderPayment> {
    if (payment.status !== 'pending' || payment.asaasPaymentId) return payment;

    return (await this.asaas.tryCreateCharge(payment.id)) ?? payment;
  }

  // --- internos -------------------------------------------------------------

  /**
   * De quem e o pedido.
   *
   * Revendedor abre sempre no proprio nome — aceitar `resellerId` dele seria
   * deixar abrir pedido na carteira alheia. Master nao tem carteira, entao
   * precisa dizer em nome de quem esta contratando: e desse vinculo que saem o
   * isolamento por revendedor e a comissao (calculada por trigger sobre a taxa
   * do perfil escolhido).
   */
  private async resolveReseller(
    user: AuthenticatedUser,
    requested: string | undefined,
  ): Promise<string> {
    if (!isMaster(user)) return user.id;

    if (!requested) {
      throw new BadRequestException(
        'Escolha em nome de qual revendedor abrir o pedido',
      );
    }

    const reseller = await this.prisma.profile.findUnique({
      where: { id: requested },
      select: { id: true, role: true, status: true },
    });

    if (!reseller || reseller.role !== 'reseller') {
      throw new BadRequestException('Revendedor não encontrado');
    }

    if (reseller.status !== 'active') {
      throw new BadRequestException('Revendedor inativo não pode receber pedidos');
    }

    return reseller.id;
  }

  private priceFor(personType: PersonType): number {
    return personType === 'pj'
      ? this.config.get('RATING_PRICE_PJ', { infer: true })
      : this.config.get('RATING_PRICE_PF', { infer: true });
  }

  private async loadEditableOrder(user: AuthenticatedUser, orderId: string) {
    const order = await this.prisma.ratingOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        resellerId: true,
        client: { select: { personType: true } },
      },
    });

    if (!order) throw new NotFoundException('Pedido não encontrado');
    assertOwnership(user, order.resellerId);

    if (!isMaster(user) && !EDITABLE_STATUSES.includes(order.status as 'draft' | 'pending_doc')) {
      throw new BadRequestException('Pedido já enviado; não aceita mais alteração de documentos');
    }

    return order;
  }

  /** `sizeBytes` e BigInt e nao sobrevive ao JSON.stringify — vira number. */
  private publicDocument(document: {
    id: string;
    slot: string | null;
    fileName: string;
    mimeType: string;
    sizeBytes: bigint;
    createdAt: Date;
  }) {
    return {
      id: document.id,
      slot: document.slot,
      fileName: document.fileName,
      mimeType: document.mimeType,
      sizeBytes: Number(document.sizeBytes),
      createdAt: document.createdAt,
    };
  }

  private publicPayment(payment: OrderPayment) {
    const pixKey = this.config.get('PIX_KEY', { infer: true });
    const viaAsaas = Boolean(payment.asaasPaymentId);

    return {
      id: payment.id,
      orderId: payment.orderId,
      method: payment.method,
      methodLabel: PAYMENT_METHOD_LABEL[payment.method],
      status: payment.status,
      amount: Number(payment.amount),
      reference: payment.reference,
      paidAt: payment.paidAt,
      createdAt: payment.createdAt,
      /**
       * Com cobranca no Asaas, a instrucao e o que o gateway devolveu (fatura
       * hospedada, PIX copia e cola, boleto). Sem gateway, cai no fluxo manual:
       * chave PIX estatica do .env e baixa pelo master.
       */
      instructions: viaAsaas
        ? {
            type: payment.method,
            pixKey: null,
            invoiceUrl: payment.invoiceUrl,
            pixPayload: payment.pixPayload,
            bankSlipUrl: payment.bankSlipUrl,
            dueDate: payment.dueDate ? payment.dueDate.toISOString().slice(0, 10) : null,
          }
        : {
            type: payment.method,
            pixKey: payment.method === 'pix' && pixKey ? pixKey : null,
            invoiceUrl: null,
            pixPayload: null,
            bankSlipUrl: null,
            dueDate: null,
          },
    };
  }
}
