import { v4 as uuidv4 } from 'uuid';

export function generateIdempotencyKey(): string {
  return uuidv4();
}

export function validateIdempotencyKey(key: string): boolean {
  if (!key || typeof key !== 'string') return false;
  if (key.length > 255) return false;
  return true;
}
