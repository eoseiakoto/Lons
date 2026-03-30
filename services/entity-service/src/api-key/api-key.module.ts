import { Module } from '@nestjs/common';
import { ApiKeyService } from './api-key.service';
import { ApiKeyRotationService } from './api-key-rotation.service';

@Module({
  providers: [ApiKeyService, ApiKeyRotationService],
  exports: [ApiKeyService, ApiKeyRotationService],
})
export class ApiKeyModule {}
