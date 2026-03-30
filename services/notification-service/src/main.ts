import { initTracing } from '@lons/common';
initTracing({ serviceName: 'notification-worker' });

import { NestFactory } from '@nestjs/core';

import { NotificationServiceModule } from './notification-service.module';

async function bootstrap() {
  const app = await NestFactory.create(NotificationServiceModule);

  const port = process.env.NOTIFICATION_WORKER_PORT ?? 3003;
  await app.listen(port);
  console.log(`Notification worker running on port ${port}`);
}
bootstrap();
