import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { ClientsModule } from './clients/clients.module';
import { envFilePaths } from './config/env-files';
import { validateEnv, type Env } from './config/env.validation';
import { DashboardModule } from './dashboard/dashboard.module';
import { HealthModule } from './health/health.module';
import { LeadsModule } from './leads/leads.module';
import { OrdersModule } from './orders/orders.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProfilesModule } from './profiles/profiles.module';
import { RatingRequestsModule } from './rating-requests/rating-requests.module';
import { RatingsModule } from './ratings/ratings.module';
import { ReportsModule } from './reports/reports.module';
import { TrackingModule } from './tracking/tracking.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Do mais específico para o mais genérico: apps/api/.env vence a raiz.
      envFilePath: envFilePaths(),
      validate: validateEnv,
      cache: true,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        throttlers: [
          {
            // O .env expressa a janela em segundos; o throttler v6 quer ms.
            ttl: config.get('THROTTLE_TTL', { infer: true }) * 1000,
            limit: config.get('THROTTLE_LIMIT', { infer: true }),
          },
        ],
      }),
    }),

    PrismaModule,

    HealthModule,
    AuthModule,
    ProfilesModule,
    ClientsModule,
    OrdersModule,
    RatingsModule,
    RatingRequestsModule,
    ReportsModule,
    LeadsModule,
    DashboardModule,
    TrackingModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // A ordem importa: o JwtAuthGuard popula request.user, que o RolesGuard lê.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
