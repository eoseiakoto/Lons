import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

export interface EncryptedValue {
  ciphertext: string;
  iv: string;
  tag: string;
}

export function encrypt(plaintext: string, key: Buffer): EncryptedValue {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf-8', 'base64');
  encrypted += cipher.final('base64');

  const tag = cipher.getAuthTag();

  return {
    ciphertext: encrypted,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

export function decrypt(encryptedValue: EncryptedValue, key: Buffer): string {
  const iv = Buffer.from(encryptedValue.iv, 'base64');
  const tag = Buffer.from(encryptedValue.tag, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encryptedValue.ciphertext, 'base64', 'utf-8');
  decrypted += decipher.final('utf-8');

  return decrypted;
}

export function encryptToString(plaintext: string, key: Buffer): string {
  const encrypted = encrypt(plaintext, key);
  return JSON.stringify(encrypted);
}

export function decryptFromString(encryptedString: string, key: Buffer): string {
  const encrypted: EncryptedValue = JSON.parse(encryptedString);
  return decrypt(encrypted, key);
}

export function generateEncryptionKey(): Buffer {
  return crypto.randomBytes(32);
}
