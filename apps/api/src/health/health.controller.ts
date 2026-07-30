import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Status da API e da conexão com o banco' })
  async check() {
    const database = await this.prisma.isHealthy();

    return {
      status: database ? 'ok' : 'degraded',
      database: database ? 'up' : 'down',
      timestamp: new Date().toISOString(),
    };
  }
}
