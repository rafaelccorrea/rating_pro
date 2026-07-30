import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { RatingRequestsController } from './rating-requests.controller';
import { RatingRequestsService } from './rating-requests.service';

@Module({
  imports: [StorageModule],
  controllers: [RatingRequestsController],
  providers: [RatingRequestsService],
})
export class RatingRequestsModule {}
