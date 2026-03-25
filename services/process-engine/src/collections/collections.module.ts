import { Module } from '@nestjs/common';

import { CollectionsService } from './collections.service';

@Module({
  providers: [CollectionsService],
  exports: [CollectionsService],
})
export class CollectionsModule {}
