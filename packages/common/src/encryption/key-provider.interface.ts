export interface IKeyProvider {
  getKey(keyId?: string): Promise<Buffer>;
  rotateKey(): Promise<{ newKeyId: string }>;
  getCurrentKeyId(): string;
}

export const KEY_PROVIDER_TOKEN = 'KEY_PROVIDER';
