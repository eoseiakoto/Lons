import { EnvKeyProvider } from './env-key.provider';
import { IKeyProvider } from './key-provider.interface';
import { VaultKeyProvider } from './vault-key.provider';
import { AwsSecretsManagerKeyProvider } from './aws-secrets-manager-key.provider';

type KeyProviderType = 'env' | 'vault' | 'aws';

/**
 * Returns the appropriate IKeyProvider implementation based on the
 * KEY_PROVIDER environment variable ('env' | 'vault' | 'aws').  Defaults to 'env'.
 */
export function createKeyProvider(): IKeyProvider {
  const providerType = (process.env.KEY_PROVIDER ?? 'env') as KeyProviderType;

  switch (providerType) {
    case 'vault':
      return new VaultKeyProvider();
    case 'aws':
      return new AwsSecretsManagerKeyProvider();
    case 'env':
    default:
      return new EnvKeyProvider();
  }
}
