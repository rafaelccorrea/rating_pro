import { Controller, Get, Header, Param, ParseUUIDPipe, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators';
import type { AuthenticatedUser } from '../common/types';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('orders/:id/report')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  @ApiOperation({ summary: 'Baixa o laudo em PDF do pedido' })
  @ApiProduces('application/pdf')
  // O interceptor de serialização mexeria no Buffer; devolver via `res` direto
  // mantém o binário intacto.
  @Header('Cache-Control', 'private, no-store')
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) orderId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { fileName, pdf } = await this.reports.generate(user, orderId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Length', pdf.byteLength);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.end(pdf);
  }
}
