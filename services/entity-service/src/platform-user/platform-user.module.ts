import { Module } from '@nestjs/common';

import { PlatformUserService } from './platform-user.service';

@Module({
  providers: [PlatformUserService],
  exports: [PlatformUserService],
})
export class PlatformUserModule {}
