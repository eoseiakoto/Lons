import { Module, OnModuleInit } from '@nestjs/common';

@Module({})
export class TracingModule implements OnModuleInit {
  onModuleInit(): void {
    if (process.env.ENABLE_TRACING === 'true') {
      console.log(
        '[TracingModule] Tracing enabled — configure OTEL_EXPORTER_ENDPOINT',
      );
    } else {
      console.log('[TracingModule] Tracing disabled (ENABLE_TRACING != true)');
    }
  }
}
