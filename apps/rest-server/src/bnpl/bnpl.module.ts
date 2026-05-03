import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';
import { BnplModule as ProcessEngineBnplModule } from '@lons/process-engine';
import { EntityServiceModule } from '@lons/entity-service';

import { BnplController } from './bnpl.controller';

@Module({
  imports: [PrismaModule, ProcessEngineBnplModule, EntityServiceModule],
  controllers: [BnplController],
})
export class BnplRestModule {}
