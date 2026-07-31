import { Module } from '@nestjs/common';
import { AsaasModule } from '../integrations/asaas/asaas.module';
import { PartnersController } from './partners.controller';
import { PartnersService } from './partners.service';

@Module({
  imports: [AsaasModule],
  controllers: [PartnersController],
  providers: [PartnersService],
})
export class PartnersModule {}
