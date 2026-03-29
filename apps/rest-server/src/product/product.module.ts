import { Module } from '@nestjs/common';
import { EntityServiceModule } from '@lons/entity-service';
import { ProductController } from './product.controller';

@Module({
  imports: [EntityServiceModule],
  controllers: [ProductController],
})
export class ProductModule {}
