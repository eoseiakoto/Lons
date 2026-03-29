import { initTracing } from '@lons/common';
initTracing({ serviceName: 'scheduler' });

import { NestFactory } from '@nestjs/core';

import { SchedulerModule } from './scheduler.module';

async function bootstrap() {
  const app = await NestFactory.create(SchedulerModule);
  await app.listen(3003);
  console.log('Scheduler service running on port 3003');
}
bootstrap();
