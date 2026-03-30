import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

/**
 * Guards against production deployments where the ENCRYPTION_KEY env var is
 * missing.  Registers as an `OnModuleInit` hook so the check runs at
 * application bootstrap time — before any request is served.
 */
@Injectable()
export class EncryptionStartupValidator implements OnModuleInit {
  private readonly logger = new Logger(EncryptionStartupValidator.name);

  onModuleInit(): void {
    const env = process.env.NODE_ENV;

    if (env !== 'production') {
      // In development / test environments we allow the key to be absent so
      // that the service can start without full infrastructure.
      return;
    }

    const key = process.env.ENCRYPTION_KEY;
    if (!key) {
      throw new Error(
        '[EncryptionStartupValidator] ENCRYPTION_KEY must be set in production. ' +
          'Provide a base64-encoded 32-byte AES-256-GCM key.',
      );
    }

    const decoded = Buffer.from(key, 'base64');
    if (decoded.length !== 32) {
      throw new Error(
        `[EncryptionStartupValidator] ENCRYPTION_KEY must decode to 32 bytes, got ${decoded.length}. ` +
          'Regenerate the key with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
      );
    }

    this.logger.log('Encryption key validated successfully.');
  }
}
