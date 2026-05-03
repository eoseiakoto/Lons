'use client';

import { useRouter } from 'next/navigation';
import { Key } from 'lucide-react';

export default function ApiKeysPage() {
  const router = useRouter();

  return (
    <div className="max-w-2xl space-y-8 animate-enter">
      <button onClick={() => router.push('/settings')} className="text-sm text-[color:var(--accent-primary-deep)] hover:underline">
        &larr; Back to Settings
      </button>
      <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">API Keys</h1>

      <div className="card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Key className="w-5 h-5 text-[color:var(--accent-primary-deep)]" />
          <h2 className="text-sm font-semibold text-[color:var(--text-primary)]">Service API Keys</h2>
        </div>
        <p className="text-sm text-[color:var(--text-tertiary)]">
          API key management will be available in a future release.
          Platform API keys are used for service-to-service authentication.
        </p>
        <button className="glass-button text-sm mt-4 opacity-50 cursor-not-allowed" disabled>
          Generate New Key
        </button>
      </div>
    </div>
  );
}
