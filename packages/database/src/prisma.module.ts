import { Global, Module } from '@nestjs/common';
import { EncryptionStartupValidator } from '@lons/common';

import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, EncryptionStartupValidator],
  exports: [PrismaService],
})
export class PrismaModule {}
