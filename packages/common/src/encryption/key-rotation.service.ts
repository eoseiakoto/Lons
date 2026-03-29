import { Injectable } from '@nestjs/common';
import { decryptFromString, encryptToString } from './aes-gcm.util';

/**
 * Service that assists with encryption key rotation.
 *
 * During a key rotation event, every encrypted field value in the database
 * must be re-encrypted with the new key.  This service provides the
 * field-level re-encryption primitive; the orchestration of iterating over
 * all records belongs to a dedicated migration/rotation job.
 */
@Injectable()
export class KeyRotationService {
  /**
   * Decrypts an encrypted field value with `oldKey` and re-encrypts it with
   * `newKey`.  Returns the new encrypted string ready for storage.
   *
   * @param oldKey - The 32-byte AES-256-GCM key that was used for the original encryption.
   * @param newKey - The 32-byte AES-256-GCM key to use for the new encryption.
   * @param encryptedString - The JSON-encoded EncryptedValue string currently stored in the DB.
   */
  rotateEncryptedField(oldKey: Buffer, newKey: Buffer, encryptedString: string): string {
    const plaintext = decryptFromString(encryptedString, oldKey);
    return encryptToString(plaintext, newKey);
  }
}
