import { initTracing } from '@lons/common';
initTracing({ serviceName: 'graphql-server' });

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      // S19-2 (FR-SEC-005.3): HSTS — instruct browsers to force HTTPS
      // for this origin (and subdomains) for 1 year. `preload: true`
      // signals eligibility for the HSTS preload list; submission to
      // hstspreload.org happens out-of-band per environment.
      strictTransportSecurity: {
        maxAge: 31536000, // 1 year in seconds
        includeSubDomains: true,
        preload: true,
      },
    }),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS — explicit allowlist. `origin: true` (the default of `enableCors()`)
  // reflects any Origin header back, which is functionally `*` for credentialed
  // requests and is forbidden by CLAUDE.md. We accept the admin and platform
  // portal origins, plus an optional comma-separated `CORS_ORIGINS` for staging
  // / preview deploys.
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
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Idempotency-Key', 'X-Tenant-Context'],
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`GraphQL server running on http://localhost:${port}/graphql`);
  console.log(`CORS allowed origins: ${allowedOrigins.join(', ')}`);
}
bootstrap();
