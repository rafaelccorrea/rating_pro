import { Body, Controller, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { issueRatingSchema, type IssueRatingInput } from '@rating-pro/shared';
import { CurrentUser, Roles } from '../common/decorators';
import type { AuthenticatedUser } from '../common/types';
import { zodPipe } from '../common/zod-validation.pipe';
import { RatingsService } from './ratings.service';

@ApiTags('ratings')
@ApiBearerAuth()
@Roles('master')
@Controller('orders/:id/rating')
export class RatingsController {
  constructor(private readonly ratings: RatingsService) {}

  @Post()
  @ApiOperation({ summary: 'Emite o rating, gera o laudo e entrega o pedido (master)' })
  issue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) orderId: string,
    @Body(zodPipe(issueRatingSchema)) input: IssueRatingInput,
  ) {
    return this.ratings.issue(user, orderId, input);
  }

  @Patch()
  @ApiOperation({ summary: 'Corrige um rating emitido e regera o laudo (master)' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) orderId: string,
    @Body(zodPipe(issueRatingSchema)) input: IssueRatingInput,
  ) {
    return this.ratings.update(user, orderId, input);
  }
}
