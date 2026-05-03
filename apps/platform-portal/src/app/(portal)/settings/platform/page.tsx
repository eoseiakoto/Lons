'use client';

import { useRouter } from 'next/navigation';
import { Globe, Settings } from 'lucide-react';

export default function PlatformInfoPage() {
  const router = useRouter();

  return (
    <div className="max-w-2xl space-y-8 animate-enter">
      <button onClick={() => router.push('/settings')} className="text-sm text-[color:var(--accent-primary-deep)] hover:underline">
        &larr; Back to Settings
      </button>
      <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">Platform Info</h1>

      <div className="space-y-6">
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <Globe className="w-5 h-5 text-[color:var(--accent-primary-deep)]" />
            <h2 className="text-sm font-semibold text-[color:var(--text-primary)]">Platform Information</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="section-label">Platform</p>
              <p className="text-sm text-[color:var(--text-primary)] mt-1">Lons Lending Platform</p>
            </div>
            <div>
              <p className="section-label">Version</p>
              <p className="text-sm text-[color:var(--text-primary)] mt-1">0.1.0</p>
            </div>
            <div>
              <p className="section-label">GraphQL Endpoint</p>
              <p className="text-sm text-[color:var(--text-secondary)] mt-1 font-mono">{process.env.NEXT_PUBLIC_GRAPHQL_URL || 'http://localhost:3000/graphql'}</p>
            </div>
            <div>
              <p className="section-label">REST Endpoint</p>
              <p className="text-sm text-[color:var(--text-secondary)] mt-1 font-mono">{process.env.NEXT_PUBLIC_REST_URL || 'http://localhost:3002'}</p>
            </div>
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <Settings className="w-5 h-5 text-[color:var(--accent-primary-deep)]" />
            <h2 className="text-sm font-semibold text-[color:var(--text-primary)]">API Configuration</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="section-label">Scoring Service</p>
              <p className="text-sm text-[color:var(--text-secondary)] mt-1 font-mono">{process.env.NEXT_PUBLIC_SCORING_URL || 'http://localhost:8000'}</p>
            </div>
            <div>
              <p className="section-label">Database</p>
              <p className="text-sm text-[color:var(--text-secondary)] mt-1 font-mono">PostgreSQL 16</p>
            </div>
            <div>
              <p className="section-label">Cache</p>
              <p className="text-sm text-[color:var(--text-secondary)] mt-1 font-mono">Redis 7</p>
            </div>
            <div>
              <p className="section-label">Message Queue</p>
              <p className="text-sm text-[color:var(--text-secondary)] mt-1 font-mono">BullMQ (Redis-backed)</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
