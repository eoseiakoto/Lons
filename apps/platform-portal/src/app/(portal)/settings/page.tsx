'use client';

import { Settings, Key, Globe } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white">Platform Settings</h3>
        <p className="text-sm text-white/40">Manage platform-wide configuration</p>
      </div>

      <div className="glass p-6">
        <div className="flex items-center gap-3 mb-4">
          <Globe className="w-5 h-5 text-blue-400" />
          <h4 className="text-sm font-semibold text-white">Platform Information</h4>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wider">Platform</p>
            <p className="text-sm text-white mt-1">Lons Lending Platform</p>
          </div>
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wider">Version</p>
            <p className="text-sm text-white mt-1">0.1.0</p>
          </div>
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wider">GraphQL Endpoint</p>
            <p className="text-sm text-white/60 mt-1 font-mono">{process.env.NEXT_PUBLIC_GRAPHQL_URL || 'http://localhost:3000/graphql'}</p>
          </div>
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wider">REST Endpoint</p>
            <p className="text-sm text-white/60 mt-1 font-mono">{process.env.NEXT_PUBLIC_REST_URL || 'http://localhost:3002'}</p>
          </div>
        </div>
      </div>

      <div className="glass p-6">
        <div className="flex items-center gap-3 mb-4">
          <Settings className="w-5 h-5 text-blue-400" />
          <h4 className="text-sm font-semibold text-white">API Configuration</h4>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wider">Scoring Service</p>
            <p className="text-sm text-white/60 mt-1 font-mono">{process.env.NEXT_PUBLIC_SCORING_URL || 'http://localhost:8000'}</p>
          </div>
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wider">Database</p>
            <p className="text-sm text-white/60 mt-1 font-mono">PostgreSQL 16</p>
          </div>
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wider">Cache</p>
            <p className="text-sm text-white/60 mt-1 font-mono">Redis 7</p>
          </div>
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wider">Message Queue</p>
            <p className="text-sm text-white/60 mt-1 font-mono">BullMQ (Redis-backed)</p>
          </div>
        </div>
      </div>

      <div className="glass p-6">
        <div className="flex items-center gap-3 mb-4">
          <Key className="w-5 h-5 text-blue-400" />
          <h4 className="text-sm font-semibold text-white">API Keys</h4>
        </div>
        <p className="text-sm text-white/40">
          API key management will be available in a future release.
          Platform API keys are used for service-to-service authentication.
        </p>
        <button className="glass-button text-sm mt-4 opacity-50 cursor-not-allowed" disabled>
          Manage API Keys
        </button>
      </div>
    </div>
  );
}
