import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  confirmPaymentSchema,
  documentSlotSchema,
  MAX_DOCUMENT_BYTES,
  ratingRequestSchema,
  type ConfirmPaymentInput,
  type RatingRequestInput,
} from '@rating-pro/shared';
import { CurrentUser, Roles } from '../common/decorators';
import type { AuthenticatedUser } from '../common/types';
import { zodPipe } from '../common/zod-validation.pipe';
import { RatingRequestsService, type UploadedDocument } from './rating-requests.service';

@ApiTags('rating-requests')
@ApiBearerAuth()
@Controller('rating-requests')
export class RatingRequestsController {
  constructor(private readonly requests: RatingRequestsService) {}

  @Post()
  @ApiOperation({ summary: 'Abre uma contratação de rating (etapas 1, 2 e 4)' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodPipe(ratingRequestSchema)) input: RatingRequestInput,
  ) {
    return this.requests.create(user, input);
  }

  @Get(':orderId/documents')
  @ApiOperation({ summary: 'Checklist do pedido e o que já foi enviado' })
  listDocuments(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.requests.listDocuments(user, orderId);
  }

  @Post(':orderId/documents')
  @ApiOperation({ summary: 'Envia (ou substitui) o anexo de um item do checklist' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['slot', 'file'],
      properties: {
        slot: { type: 'string' },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  // O limite tambem e checado no service; aqui ele evita carregar na memoria um
  // arquivo que seria recusado depois.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_DOCUMENT_BYTES } }))
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body(zodPipe(documentSlotSchema)) body: { slot: string },
    @UploadedFile() file?: UploadedDocument,
  ) {
    if (!file) {
      throw new BadRequestException('Envie o arquivo no campo "file"');
    }

    return this.requests.attachDocument(user, orderId, body.slot, file);
  }

  @Get(':orderId/documents/:documentId')
  @ApiOperation({ summary: 'Baixa um anexo (passa pela checagem de dono)' })
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { stream, fileName, mimeType } = await this.requests.openDocument(
      user,
      orderId,
      documentId,
    );

    response.setHeader('Content-Type', mimeType);
    response.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    return stream;
  }

  @Delete(':orderId/documents/:documentId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove um anexo enquanto o pedido é rascunho' })
  removeDocument(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    return this.requests.removeDocument(user, orderId, documentId);
  }

  @Post(':orderId/submit')
  @ApiOperation({ summary: 'Confere o checklist obrigatório e envia para análise' })
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.requests.submit(user, orderId);
  }

  @Get(':orderId/payment')
  @ApiOperation({ summary: 'Cobrança mais recente do pedido' })
  payment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.requests.findPayment(user, orderId);
  }

  @Post('payments/:paymentId/confirm')
  @Roles('master')
  @ApiOperation({ summary: 'Baixa manual da cobrança (gancho do futuro webhook)' })
  confirmPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
    @Body(zodPipe(confirmPaymentSchema)) input: ConfirmPaymentInput,
  ) {
    return this.requests.confirmPayment(user, paymentId, input);
  }
}
