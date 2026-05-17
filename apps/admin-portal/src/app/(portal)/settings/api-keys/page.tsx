'use client';

/**
 * Sprint 18 (S18-5 / FR-SET-001.1) — API Key Management UI.
 *
 * Operators can list, create, rotate, and revoke API keys. The
 * plaintext key + secret are shown exactly once at creation /
 * rotation — never re-fetchable. Copy buttons reduce the risk of
 * users mistyping the credential.
 */

import { useEffect, useState } from 'react';
import { gql, useMutation, useQuery } from '@apollo/client';
import { KeyRound, Plus, RotateCw, Trash2, Copy, Check } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/components/ui/toast';
import { SlideOver } from '@/components/ui/slide-over';
import { useI18n } from '@/lib/i18n';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDateTime } from '@/lib/utils';

const API_KEYS_QUERY = gql`
  query ApiKeys($tenantId: ID!) {
    apiKeys(tenantId: $tenantId) {
      id
      name
      keyHash
      rateLimitPerMin
      expiresAt
      revokedAt
      lastUsedAt
      createdAt
    }
  }
`;

const CREATE_API_KEY = gql`
  mutation CreateApiKey(
    $tenantId: ID!
    $name: String!
    $rateLimitPerMin: Int
    $expiresAt: DateTime
  ) {
    createApiKey(
      tenantId: $tenantId
      name: $name
      rateLimitPerMin: $rateLimitPerMin
      expiresAt: $expiresAt
    ) {
      id
      name
      plaintext
      plaintextSecret
      rateLimitPerMin
      expiresAt
      createdAt
    }
  }
`;

const ROTATE_API_KEY = gql`
  mutation RotateApiKey($tenantId: ID!, $apiKeyId: ID!, $gracePeriodHours: Int) {
    rotateApiKey(tenantId: $tenantId, apiKeyId: $apiKeyId, gracePeriodHours: $gracePeriodHours) {
      id
      name
      key
      createdAt
    }
  }
`;

const REVOKE_API_KEY = gql`
  mutation RevokeApiKey($tenantId: ID!, $apiKeyId: ID!) {
    revokeApiKey(tenantId: $tenantId, apiKeyId: $apiKeyId) {
      success
      message
    }
  }
`;

interface ApiKey {
  id: string;
  name: string;
  keyHash: string;
  rateLimitPerMin: number;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

type Panel = 'create' | 'rotate' | 'revoke' | 'show-secret' | null;

interface PlaintextDisclosure {
  title: string;
  plaintext: string;
  plaintextSecret?: string;
  hint: string;
}

export default function ApiKeysPage() {
  const { t } = useI18n();
  const { toast } = useToast();
  const { user } = useAuth();
  const tenantId = user?.tenantId;

  const { data, loading, refetch } = useQuery(API_KEYS_QUERY, {
    variables: { tenantId },
    skip: !tenantId,
    fetchPolicy: 'cache-and-network',
  });

  const [panel, setPanel] = useState<Panel>(null);
  const [selectedKey, setSelectedKey] = useState<ApiKey | null>(null);
  const [disclosure, setDisclosure] = useState<PlaintextDisclosure | null>(null);

  const [createApiKey, { loading: creating }] = useMutation(CREATE_API_KEY);
  const [rotateApiKey, { loading: rotating }] = useMutation(ROTATE_API_KEY);
  const [revokeApiKey, { loading: revoking }] = useMutation(REVOKE_API_KEY);

  const keys: ApiKey[] = data?.apiKeys ?? [];

  const handleCreate = async (name: string, rateLimit: number, expiresAt: string | null) => {
    try {
      const { data } = await createApiKey({
        variables: {
          tenantId,
          name,
          rateLimitPerMin: rateLimit,
          expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        },
      });
      const result = data?.createApiKey;
      if (!result) throw new Error('No result');
      setPanel('show-secret');
      setDisclosure({
        title: t('apiKeys.created') || 'API key created',
        plaintext: result.plaintext,
        plaintextSecret: result.plaintextSecret,
        hint:
          t('apiKeys.copyHint') ||
          'Copy these values now — they will never be shown again. Store them in your secret manager.',
      });
      void refetch();
    } catch (e) {
      toast('error', (e as Error).message);
    }
  };

  const handleRotate = async (grace: number) => {
    if (!selectedKey) return;
    try {
      const { data } = await rotateApiKey({
        variables: { tenantId, apiKeyId: selectedKey.id, gracePeriodHours: grace },
      });
      const result = data?.rotateApiKey;
      if (!result) throw new Error('No result');
      setPanel('show-secret');
      setDisclosure({
        title: t('apiKeys.rotated') || 'API key rotated',
        plaintext: result.key,
        hint:
          t('apiKeys.rotateHint') ||
          `The old key remains valid for ${grace}h. After that, only the new key works.`,
      });
      void refetch();
    } catch (e) {
      toast('error', (e as Error).message);
    }
  };

  const handleRevoke = async () => {
    if (!selectedKey) return;
    try {
      await revokeApiKey({
        variables: { tenantId, apiKeyId: selectedKey.id },
      });
      toast('success', t('apiKeys.revoked') || 'API key revoked');
      setPanel(null);
      setSelectedKey(null);
      void refetch();
    } catch (e) {
      toast('error', (e as Error).message);
    }
  };

  const statusOf = (k: ApiKey): string => {
    if (k.revokedAt) return 'rejected';
    if (k.expiresAt && new Date(k.expiresAt) < new Date()) return 'discontinued';
    return 'active';
  };

  return (
    <div className="relative space-y-8 animate-enter">
      <PageBackdrop />

      <PageHeader
        eyebrow={t('eyebrow.security') || 'Security'}
        title={t('apiKeys.title') || 'API Keys'}
        subtitle={t('apiKeys.subtitle') || 'Programmatic access credentials for your tenant'}
      />

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setPanel('create')}
          className="px-3 py-2 rounded-lg text-[13px] font-medium flex items-center gap-1.5"
          style={{ backgroundColor: 'var(--accent-primary)', color: 'var(--text-on-accent)' }}
        >
          <Plus className="w-3.5 h-3.5" />
          {t('apiKeys.create') || 'Create new key'}
        </button>
      </div>

      <section className="card-glow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--border-subtle)]">
                <Th>Name</Th>
                <Th>Key ID</Th>
                <Th>Status</Th>
                <Th>Rate Limit</Th>
                <Th>Created</Th>
                <Th>Last used</Th>
                <Th>Expires</Th>
                <Th className="w-32" />
              </tr>
            </thead>
            <tbody>
              {loading && keys.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-[color:var(--text-tertiary)]">
                    {t('common.loading')}
                  </td>
                </tr>
              ) : keys.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12">
                    <KeyRound className="w-8 h-8 mx-auto text-[color:var(--text-tertiary)] mb-3" />
                    <p className="text-sm text-[color:var(--text-secondary)]">
                      {t('apiKeys.empty') || 'No API keys yet — create one to get started.'}
                    </p>
                  </td>
                </tr>
              ) : (
                keys.map((k) => (
                  <tr
                    key={k.id}
                    className="border-b border-[color:var(--border-subtle)] last:border-b-0 hover:bg-[color:var(--bg-hover)]"
                  >
                    <Td>
                      <span className="font-medium">{k.name}</span>
                    </Td>
                    <Td>
                      <span className="font-mono text-xs text-[color:var(--text-tertiary)]">
                        {k.id.slice(0, 12)}…
                      </span>
                    </Td>
                    <Td>
                      <StatusBadge status={statusOf(k)} />
                    </Td>
                    <Td>
                      <span className="tabular-nums">{k.rateLimitPerMin} / min</span>
                    </Td>
                    <Td>
                      <span className="tabular-nums text-[12px] text-[color:var(--text-tertiary)]">
                        {formatDateTime(k.createdAt)}
                      </span>
                    </Td>
                    <Td>
                      <span className="tabular-nums text-[12px] text-[color:var(--text-tertiary)]">
                        {k.lastUsedAt ? formatDateTime(k.lastUsedAt) : '—'}
                      </span>
                    </Td>
                    <Td>
                      <span className="tabular-nums text-[12px] text-[color:var(--text-tertiary)]">
                        {k.expiresAt ? formatDateTime(k.expiresAt) : '—'}
                      </span>
                    </Td>
                    <Td>
                      {!k.revokedAt && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedKey(k);
                              setPanel('rotate');
                            }}
                            className="p-1.5 rounded hover:bg-[color:var(--bg-hover)] text-[color:var(--text-secondary)]"
                            title={t('apiKeys.rotate') || 'Rotate'}
                          >
                            <RotateCw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedKey(k);
                              setPanel('revoke');
                            }}
                            className="p-1.5 rounded hover:bg-[color:var(--status-error-soft)] text-[color:var(--status-error-text)]"
                            title={t('apiKeys.revoke') || 'Revoke'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {panel === 'create' && (
        <CreateKeyPanel onClose={() => setPanel(null)} onSubmit={handleCreate} loading={creating} />
      )}
      {panel === 'rotate' && selectedKey && (
        <RotateKeyPanel
          keyName={selectedKey.name}
          onClose={() => {
            setPanel(null);
            setSelectedKey(null);
          }}
          onSubmit={handleRotate}
          loading={rotating}
        />
      )}
      {panel === 'revoke' && selectedKey && (
        <RevokeKeyPanel
          keyName={selectedKey.name}
          onClose={() => {
            setPanel(null);
            setSelectedKey(null);
          }}
          onConfirm={handleRevoke}
          loading={revoking}
        />
      )}
      {panel === 'show-secret' && disclosure && (
        <ShowSecretPanel
          disclosure={disclosure}
          onClose={() => {
            setPanel(null);
            setDisclosure(null);
            setSelectedKey(null);
          }}
        />
      )}

      <ApiKeyStyles />
    </div>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[color:var(--text-tertiary)] ${className ?? ''}`}
    >
      {children}
    </th>
  );
}
function Td({ children }: { children?: React.ReactNode }) {
  return <td className="px-4 py-3.5">{children}</td>;
}

function CreateKeyPanel({
  onClose,
  onSubmit,
  loading,
}: {
  onClose: () => void;
  onSubmit: (name: string, rateLimit: number, expiresAt: string | null) => void | Promise<void>;
  loading?: boolean;
}) {
  const [name, setName] = useState('');
  const [rate, setRate] = useState(60);
  const [expires, setExpires] = useState('');
  return (
    <SlideOver title="Create new API key" onClose={onClose}>
      <div className="space-y-4 text-sm">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className="ak-input" />
        </Field>
        <Field label="Rate limit (req/min)">
          <input
            type="number"
            min={1}
            value={rate}
            onChange={(e) => setRate(parseInt(e.target.value || '60', 10))}
            className="ak-input"
          />
        </Field>
        <Field label="Expires (optional)">
          <input
            type="date"
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
            className="ak-input"
          />
        </Field>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} disabled={loading} className="ak-btn-secondary flex-1">
            Cancel
          </button>
          <button
            onClick={() => onSubmit(name, rate, expires || null)}
            disabled={loading || !name.trim()}
            className="ak-btn-primary flex-1"
          >
            {loading ? 'Creating…' : 'Create key'}
          </button>
        </div>
      </div>
    </SlideOver>
  );
}

function RotateKeyPanel({
  keyName,
  onClose,
  onSubmit,
  loading,
}: {
  keyName: string;
  onClose: () => void;
  onSubmit: (graceHours: number) => void | Promise<void>;
  loading?: boolean;
}) {
  const [grace, setGrace] = useState(24);
  return (
    <SlideOver title="Rotate API key" subtitle={keyName} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <p className="text-[13px] text-[color:var(--text-tertiary)]">
          A new key will be generated. The old key remains valid for the grace period so
          integrations have time to switch over.
        </p>
        <Field label="Grace period">
          <select
            value={grace}
            onChange={(e) => setGrace(parseInt(e.target.value, 10))}
            className="ak-input"
          >
            <option value={1}>1 hour</option>
            <option value={6}>6 hours</option>
            <option value={12}>12 hours</option>
            <option value={24}>24 hours (default)</option>
            <option value={48}>48 hours</option>
            <option value={72}>72 hours</option>
          </select>
        </Field>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} disabled={loading} className="ak-btn-secondary flex-1">
            Cancel
          </button>
          <button
            onClick={() => onSubmit(grace)}
            disabled={loading}
            className="ak-btn-primary flex-1"
          >
            {loading ? 'Rotating…' : 'Rotate key'}
          </button>
        </div>
      </div>
    </SlideOver>
  );
}

function RevokeKeyPanel({
  keyName,
  onClose,
  onConfirm,
  loading,
}: {
  keyName: string;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
}) {
  const [confirm, setConfirm] = useState('');
  return (
    <SlideOver title="Revoke API key" subtitle={keyName} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div
          className="p-3 rounded-md text-[13px]"
          style={{
            backgroundColor: 'var(--status-error-soft)',
            color: 'var(--status-error-text)',
            border: '1px solid var(--status-error)',
          }}
        >
          This key will be immediately invalidated. Any integrations using this key will stop
          working. This action cannot be undone.
        </div>
        <Field label='Type REVOKE to confirm'>
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="ak-input"
            placeholder="REVOKE"
          />
        </Field>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} disabled={loading} className="ak-btn-secondary flex-1">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading || confirm !== 'REVOKE'}
            className="ak-btn-danger flex-1"
          >
            {loading ? 'Revoking…' : 'Revoke key'}
          </button>
        </div>
      </div>
    </SlideOver>
  );
}

function ShowSecretPanel({
  disclosure,
  onClose,
}: {
  disclosure: PlaintextDisclosure;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState<'key' | 'secret' | null>(null);

  const copy = async (value: string, kind: 'key' | 'secret') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      toast('success', 'Copied to clipboard');
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast('error', 'Clipboard write failed');
    }
  };

  // Auto-close warning if the user navigates away (panel state cleanup
  // is the caller's responsibility).
  useEffect(() => () => undefined, []);

  return (
    <SlideOver title={disclosure.title} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div
          className="p-3 rounded-md text-[13px]"
          style={{
            backgroundColor: 'var(--status-warning-soft)',
            color: 'var(--status-warning-text)',
            border: '1px solid var(--status-warning)',
          }}
        >
          {disclosure.hint}
        </div>

        <SecretRow
          label="API Key"
          value={disclosure.plaintext}
          onCopy={() => copy(disclosure.plaintext, 'key')}
          copied={copied === 'key'}
        />

        {disclosure.plaintextSecret && (
          <SecretRow
            label="API Secret"
            value={disclosure.plaintextSecret}
            onCopy={() => copy(disclosure.plaintextSecret!, 'secret')}
            copied={copied === 'secret'}
          />
        )}

        <button onClick={onClose} className="ak-btn-secondary w-full mt-4">
          I have saved these values
        </button>
      </div>
    </SlideOver>
  );
}

function SecretRow({
  label,
  value,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <code className="flex-1 px-3 py-2 rounded-md font-mono text-[12px] break-all overflow-x-auto"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        >
          {value}
        </code>
        <button
          type="button"
          onClick={onCopy}
          className="p-2 rounded-md"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-secondary)',
          }}
          aria-label="Copy"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
    </Field>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[12px] font-medium text-[color:var(--text-secondary)] mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function ApiKeyStyles() {
  return (
    <style jsx global>{`
      .ak-input {
        width: 100%;
        border-radius: 6px;
        border: 1px solid var(--border-subtle);
        background: var(--bg-card);
        color: var(--text-primary);
        padding: 8px 12px;
        font-size: 14px;
      }
      .ak-btn-primary {
        background: var(--accent-primary);
        color: var(--text-on-accent);
        border: none;
        border-radius: 6px;
        padding: 8px 16px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
      }
      .ak-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
      .ak-btn-secondary {
        background: var(--bg-elevated);
        color: var(--text-primary);
        border: 1px solid var(--border-default);
        border-radius: 6px;
        padding: 8px 16px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
      }
      .ak-btn-danger {
        background: var(--status-error);
        color: white;
        border: none;
        border-radius: 6px;
        padding: 8px 16px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
      }
      .ak-btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
    `}</style>
  );
}
