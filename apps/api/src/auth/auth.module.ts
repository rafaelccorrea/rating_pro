import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { Env } from '../config/env.validation';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ProfileCacheService } from './profile-cache.service';

/**
 * Global porque o JwtAuthGuard, registrado como APP_GUARD, depende do
 * AuthService para validar o token de toda requisição.
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: {
          expiresIn: config.get('JWT_EXPIRES_IN', { infer: true }),
          issuer: 'rating-pro',
        },
        verifyOptions: { issuer: 'rating-pro' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, ProfileCacheService],
  exports: [AuthService, ProfileCacheService],
})
export class AuthModule {}
