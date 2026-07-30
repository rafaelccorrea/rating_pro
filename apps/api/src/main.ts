import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { SerializeInterceptor } from './common/serialize.interceptor';
import type { Env } from './config/env.validation';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService<Env, true>);
  const logger = new Logger('Bootstrap');

  const prefix = config.get('API_PREFIX', { infer: true });
  // Hosts gerenciados (Hostinger etc.) injetam PORT; API_PORT vale localmente.
  const port = Number(process.env.PORT ?? config.get('API_PORT', { infer: true }));
  // O front de producao e sempre permitido; CORS_ORIGINS adiciona outras origens.
  const origins = [
    'https://lightsalmon-sheep-614100.hostingersite.com',
    ...config
      .get('CORS_ORIGINS', { infer: true })
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  ];

  app.use(helmet());
  app.use(compression());
  app.setGlobalPrefix(prefix);

  app.enableCors({
    // Lista vazia libera tudo — aceitável só em desenvolvimento.
    origin: origins.length > 0 ? origins : true,
    credentials: true,
  });

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new SerializeInterceptor());
  app.enableShutdownHooks();

  const swagger = new DocumentBuilder()
    .setTitle('Rating Pro API')
    .setDescription('Pedidos de rating, emissão de laudo e gestão de revendedores')
    .setVersion('0.1.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Access token do Supabase Auth',
    })
    .build();

  SwaggerModule.setup(`${prefix}/docs`, app, SwaggerModule.createDocument(app, swagger));

  await app.listen(port);

  logger.log(`API em http://localhost:${port}/${prefix}`);
  logger.log(`Swagger em http://localhost:${port}/${prefix}/docs`);
}

void bootstrap();
