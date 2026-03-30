import { initTracing } from '@lons/common';
initTracing({ serviceName: 'rest-server' });

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { ResponseEnvelopeInterceptor } from './interceptors/response-envelope.interceptor';
import { BusinessExceptionFilter } from './filters/business-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(
    helmet({
      contentSecurityPolicy: false, // Swagger UI requires inline scripts
    }),
  );

  app.setGlobalPrefix('v1', { exclude: ['api/docs', 'api/docs-json', 'api/docs-yaml', 'health'] });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new BusinessExceptionFilter());
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor());

  app.enableCors();

  // --- OpenAPI / Swagger ---
  const config = new DocumentBuilder()
    .setTitle('Lons REST API')
    .setDescription(
      'B2B2C lending platform — Service Provider integration API.\n\n' +
      'All endpoints require API key authentication via `X-API-Key` and `X-API-Secret` headers.\n\n' +
      'POST endpoints accept an optional `X-Idempotency-Key` header to prevent duplicate operations.\n\n' +
      'Monetary amounts are always represented as **strings** (e.g. `"1234.56"`).',
    )
    .setVersion('1.0')
    .setContact('Lons Engineering', 'https://lons.io', 'engineering@lons.io')
    .addServer(`http://localhost:${process.env.REST_PORT || 3001}`, 'Local development')
    .addServer('https://api.staging.lons.io', 'Staging')
    .addServer('https://api.lons.io', 'Production')
    .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header', description: 'API key (lons_ prefix)' }, 'api-key')
    .addApiKey({ type: 'apiKey', name: 'X-API-Secret', in: 'header', description: 'API secret' }, 'api-secret')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'method',
    },
    customSiteTitle: 'Lons REST API — Documentation',
  });

  const port = process.env.REST_PORT || 3001;
  await app.listen(port);
  console.log(`REST server running on http://localhost:${port}`);
  console.log(`Swagger docs available at http://localhost:${port}/api/docs`);
  console.log(`OpenAPI JSON at http://localhost:${port}/api/docs-json`);
}
bootstrap();
