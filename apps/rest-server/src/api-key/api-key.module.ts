import { Module } from '@nestjs/common';
import { EntityServiceModule } from '@lons/entity-service';
import { ApiKeyController } from './api-key.controller';

@Module({
  imports: [EntityServiceModule],
  controllers: [ApiKeyController],
})
export class ApiKeyRestModule {}
