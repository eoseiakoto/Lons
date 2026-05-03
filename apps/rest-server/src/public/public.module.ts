import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';
import { PublicController } from './public.controller';

@Module({
  imports: [PrismaModule],
  controllers: [PublicController],
})
export class PublicModule {}
