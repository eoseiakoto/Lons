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

  // S19-3 (FR-SEC-014): full CSP with Swagger UI carve-outs (unsafe-inline
  // for scripts + styles, data: for icons). Replaces the old blanket
  // `contentSecurityPolicy: false`, which left every endpoint with no XSS
  // protection just so /api/docs could render.
  //
  // S19-2 (FR-SEC-005.3): HSTS — force HTTPS for this origin + subdomains
  // for 1 year and signal preload-list eligibility.
  const isDev = process.env.NODE_ENV !== 'production';
  // Dev mode allows localhost connections (HMR, devtools, local CLI).
  // In production, only same-origin XHRs from Swagger UI are permitted.
  const connectSources: string[] = ["'self'"];
  if (isDev) {
    connectSources.push('http://localhost:*', 'ws://localhost:*');
  }
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // unsafe-inline is required for Swagger UI's bootstrap script
          // and the inline styles it injects on render. Scoped tightly:
          // only this app serves Swagger; the GraphQL server's stricter
          // CSP at apps/graphql-server/src/main.ts has no unsafe-inline.
          scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
          imgSrc: ["'self'", 'data:', 'https://cdn.jsdelivr.net'],
          connectSrc: connectSources,
          fontSrc: ["'self'", 'https://cdn.jsdelivr.net'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      strictTransportSecurity: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
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

  // CORS — explicit allowlist. The default `enableCors()` reflects any
  // Origin header back, which is forbidden by CLAUDE.md (functionally `*`
  // for credentialed requests). Webhook endpoints are server-to-server and
  // don't go through CORS, so they're not affected.
  // Defaults align with lons.sh port assignments (admin-portal=3100, platform-portal=3200).
  // The historical 3001/3002 defaults pre-dated those choices and caused the
  // platform-portal health card to mark this server as DOWN even when running,
  // because the browser fetch from :3200 was rejected by the CORS allowlist.
  const adminOrigin = process.env.ADMIN_PORTAL_URL || 'http://localhost:3100';
  const platformOrigin = process.env.PLATFORM_PORTAL_URL || 'http://localhost:3200';
  const extraOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const allowedOrigins = [adminOrigin, platformOrigin, ...extraOrigins];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-API-Key', 'X-API-Secret', 'X-Idempotency-Key', 'X-Tenant-Context'],
  });

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
