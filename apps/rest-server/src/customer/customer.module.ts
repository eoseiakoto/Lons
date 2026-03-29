import { Module } from '@nestjs/common';
import { EntityServiceModule } from '@lons/entity-service';
import { CustomerController } from './customer.controller';

@Module({
  imports: [EntityServiceModule],
  controllers: [CustomerController],
})
export class CustomerModule {}
