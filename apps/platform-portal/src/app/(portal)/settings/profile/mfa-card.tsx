'use client';

import { useState } from 'react';
import { gql, useMutation } from '@apollo/client';
import { QRCodeSVG } from 'qrcode.react';
import { ShieldCheck, ShieldOff, KeyRound, Copy, Check } from 'lucide-react';

const INITIATE_MFA = gql`
  mutation InitiateMfaEnrollment($password: String!) {
    initiateMfaEnrollment(password: $password) {
      secret
      otpauthUri
      backupCodes
    }
  }
`;

const CONFIRM_MFA = gql`
  mutation ConfirmMfaEnrollment($code: String!) {
    confirmMfaEnrollment(code: $code)
  }
`;

const DISABLE_MFA = gql`
  mutation DisableMfa($password: String!) {
    disableMfa(password: $password)
  }
`;

const REGEN_BACKUP_CODES = gql`
  mutation RegenerateMfaBackupCodes($password: String!) {
    regenerateMfaBackupCodes(password: $password)
  }
`;

interface MfaCardProps {
  mfaEnabled: boolean;
  onChange: () => void; // refetch parent
}

type Mode = 'idle' | 'enroll-password' | 'enroll-verify' | 'disable' | 'regen';

interface EnrollmentPayload {
  secret: string;
  otpauthUri: string;
  backupCodes: string[];
}

export function MfaCard({ mfaEnabled, onChange }: MfaCardProps) {
  const [mode, setMode] = useState<Mode>('idle');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [enrollment, setEnrollment] = useState<EnrollmentPayload | null>(null);
  const [newBackupCodes, setNewBackupCodes] = useState<string[] | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const [initiate, { loading: initLoading }] = useMutation(INITIATE_MFA);
  const [confirm, { loading: confirmLoading }] = useMutation(CONFIRM_MFA);
  const [disable, { loading: disableLoading }] = useMutation(DISABLE_MFA);
  const [regen, { loading: regenLoading }] = useMutation(REGEN_BACKUP_CODES);

  function reset() {
    setMode('idle');
    setPassword('');
    setCode('');
    setMsg(null);
    setEnrollment(null);
    setNewBackupCodes(null);
    setCopiedSecret(false);
  }

  async function handleInitiate(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      const { data } = await initiate({ variables: { password } });
      setEnrollment(data.initiateMfaEnrollment);
      setPassword('');
      setMode('enroll-verify');
    } catch (err: any) {
      setMsg({ type: 'error', text: err?.graphQLErrors?.[0]?.message || 'Failed to initiate enrollment.' });
    }
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      const { data } = await confirm({ variables: { code: code.replace(/\s+/g, '') } });
      if (data.confirmMfaEnrollment) {
        setMsg({ type: 'success', text: 'Two-factor authentication enabled.' });
        onChange();
        // Keep the backup-code panel visible briefly so the user can save them.
        setTimeout(() => reset(), 30); // page refetch handles re-render
      } else {
        setMsg({ type: 'error', text: 'That code did not match. Try again with the latest 6-digit code from your authenticator.' });
      }
    } catch (err: any) {
      setMsg({ type: 'error', text: err?.graphQLErrors?.[0]?.message || 'Failed to verify code.' });
    }
  }

  async function handleDisable(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      await disable({ variables: { password } });
      setMsg({ type: 'success', text: 'Two-factor authentication disabled.' });
      onChange();
      setTimeout(() => reset(), 600);
    } catch (err: any) {
      setMsg({ type: 'error', text: err?.graphQLErrors?.[0]?.message || 'Failed to disable MFA.' });
    }
  }

  async function handleRegen(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      const { data } = await regen({ variables: { password } });
      setNewBackupCodes(data.regenerateMfaBackupCodes);
      setPassword('');
      setMsg({ type: 'success', text: 'New backup codes generated. Save them — the old ones no longer work.' });
    } catch (err: any) {
      setMsg({ type: 'error', text: err?.graphQLErrors?.[0]?.message || 'Failed to regenerate backup codes.' });
    }
  }

  async function copySecret() {
    if (!enrollment) return;
    await navigator.clipboard.writeText(enrollment.secret);
    setCopiedSecret(true);
    setTimeout(() => setCopiedSecret(false), 1500);
  }

  const labelCls = 'block text-sm font-medium text-[color:var(--text-secondary)] mb-1.5';
  const msgCls = (type: 'success' | 'error') =>
    type === 'success'
      ? 'text-sm text-[color:var(--status-success-text)]'
      : 'text-sm text-[color:var(--status-error-text)]';

  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-4">
        {mfaEnabled ? (
          <ShieldCheck className="w-5 h-5 text-[color:var(--status-success-text)]" />
        ) : (
          <ShieldOff className="w-5 h-5 text-[color:var(--text-secondary)]" />
        )}
        <h2 className="text-[color:var(--text-primary)] font-medium">Two-Factor Authentication</h2>
        <span
          className={
            'ml-auto text-xs px-2 py-0.5 rounded-full ' +
            (mfaEnabled
              ? 'bg-[color:var(--status-success-bg)] text-[color:var(--status-success-text)]'
              : 'bg-[color:var(--surface-muted)] text-[color:var(--text-tertiary)]')
          }
        >
          {mfaEnabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      <p className="text-sm text-[color:var(--text-secondary)] mb-4">
        {mfaEnabled
          ? 'Your account is protected by a time-based one-time code. You\'ll be prompted for a 6-digit code on every login.'
          : 'Add a second factor to your account using an authenticator app (Google Authenticator, 1Password, Authy, Raycast, …).'}
      </p>

      {/* ── DISABLED + idle: enable button ────────────────────────────── */}
      {!mfaEnabled && mode === 'idle' && (
        <button onClick={() => setMode('enroll-password')} className="glass-button-primary text-sm">
          Enable two-factor authentication
        </button>
      )}

      {/* ── DISABLED → enroll-password: re-auth ──────────────────────── */}
      {!mfaEnabled && mode === 'enroll-password' && (
        <form onSubmit={handleInitiate} className="space-y-4">
          <p className="text-xs text-[color:var(--text-tertiary)]">
            Re-enter your password to start enrollment. This guards against an attacker with a stolen session enrolling their own device.
          </p>
          <div>
            <label className={labelCls}>Current password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setMsg(null); }}
              className="w-full glass-input"
              placeholder="Your password"
              autoFocus
              required
            />
          </div>
          {msg && <p className={msgCls(msg.type)}>{msg.text}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={reset} className="glass-button text-sm">Cancel</button>
            <button type="submit" disabled={initLoading || !password} className="glass-button-primary text-sm disabled:opacity-50">
              {initLoading ? 'Generating…' : 'Continue'}
            </button>
          </div>
        </form>
      )}

      {/* ── DISABLED → enroll-verify: scan QR + enter code ───────────── */}
      {!mfaEnabled && mode === 'enroll-verify' && enrollment && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-[auto,1fr] gap-5 items-start">
            <div className="bg-white p-3 rounded-lg w-fit mx-auto md:mx-0">
              <QRCodeSVG value={enrollment.otpauthUri} size={176} level="M" includeMargin={false} />
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-[color:var(--text-primary)] font-medium mb-1">1. Scan with your authenticator</p>
                <p className="text-xs text-[color:var(--text-tertiary)]">Or enter this key manually if your app asks for it:</p>
              </div>
              <button
                onClick={copySecret}
                className="font-mono text-xs bg-[color:var(--surface-muted)] px-3 py-2 rounded border border-[color:var(--border-default)] flex items-center gap-2 hover:bg-[color:var(--surface-hover)] transition"
                type="button"
              >
                <span className="break-all">{enrollment.secret}</span>
                {copiedSecret ? <Check className="w-3.5 h-3.5 text-[color:var(--status-success-text)] shrink-0" /> : <Copy className="w-3.5 h-3.5 shrink-0" />}
              </button>
            </div>
          </div>

          <div className="border-t border-[color:var(--border-default)] pt-4">
            <p className="text-sm text-[color:var(--text-primary)] font-medium mb-2">2. Save your backup codes</p>
            <p className="text-xs text-[color:var(--text-tertiary)] mb-3">
              Store these somewhere safe — each works once if you lose access to your authenticator. They will not be shown again.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {enrollment.backupCodes.map((c) => (
                <code key={c} className="text-xs bg-[color:var(--surface-muted)] px-2 py-1.5 rounded border border-[color:var(--border-default)] text-center font-mono">
                  {c}
                </code>
              ))}
            </div>
          </div>

          <form onSubmit={handleConfirm} className="border-t border-[color:var(--border-default)] pt-4 space-y-3">
            <p className="text-sm text-[color:var(--text-primary)] font-medium">3. Enter the 6-digit code from your authenticator</p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              value={code}
              onChange={(e) => { setCode(e.target.value); setMsg(null); }}
              className="glass-input font-mono tracking-[0.3em] text-lg text-center max-w-[180px]"
              placeholder="000000"
              autoFocus
              required
            />
            {msg && <p className={msgCls(msg.type)}>{msg.text}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={reset} className="glass-button text-sm">Cancel</button>
              <button
                type="submit"
                disabled={confirmLoading || code.replace(/\s+/g, '').length < 6}
                className="glass-button-primary text-sm disabled:opacity-50"
              >
                {confirmLoading ? 'Verifying…' : 'Verify & enable'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── ENABLED + idle: disable + regen buttons ──────────────────── */}
      {mfaEnabled && mode === 'idle' && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setMode('regen')} className="glass-button text-sm flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5" />
            Regenerate backup codes
          </button>
          <button onClick={() => setMode('disable')} className="glass-button text-sm">
            Disable two-factor authentication
          </button>
        </div>
      )}

      {/* ── ENABLED → disable: re-auth ──────────────────────────────── */}
      {mfaEnabled && mode === 'disable' && (
        <form onSubmit={handleDisable} className="space-y-4">
          <p className="text-xs text-[color:var(--text-tertiary)]">
            Disabling MFA leaves your account protected only by your password. Re-enter your password to confirm.
          </p>
          <div>
            <label className={labelCls}>Current password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setMsg(null); }}
              className="w-full glass-input"
              autoFocus
              required
            />
          </div>
          {msg && <p className={msgCls(msg.type)}>{msg.text}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={reset} className="glass-button text-sm">Cancel</button>
            <button type="submit" disabled={disableLoading || !password} className="glass-button-primary text-sm disabled:opacity-50">
              {disableLoading ? 'Disabling…' : 'Disable MFA'}
            </button>
          </div>
        </form>
      )}

      {/* ── ENABLED → regen: re-auth + show new codes ───────────────── */}
      {mfaEnabled && mode === 'regen' && (
        <div className="space-y-4">
          {!newBackupCodes ? (
            <form onSubmit={handleRegen} className="space-y-4">
              <p className="text-xs text-[color:var(--text-tertiary)]">
                Generating new backup codes will invalidate your existing ones. Re-enter your password to confirm.
              </p>
              <div>
                <label className={labelCls}>Current password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setMsg(null); }}
                  className="w-full glass-input"
                  autoFocus
                  required
                />
              </div>
              {msg && <p className={msgCls(msg.type)}>{msg.text}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={reset} className="glass-button text-sm">Cancel</button>
                <button type="submit" disabled={regenLoading || !password} className="glass-button-primary text-sm disabled:opacity-50">
                  {regenLoading ? 'Generating…' : 'Generate new codes'}
                </button>
              </div>
            </form>
          ) : (
            <>
              <div>
                <p className="text-sm text-[color:var(--text-primary)] font-medium mb-2">New backup codes</p>
                <p className="text-xs text-[color:var(--text-tertiary)] mb-3">
                  Save these somewhere safe. The previous set is no longer valid.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {newBackupCodes.map((c) => (
                    <code key={c} className="text-xs bg-[color:var(--surface-muted)] px-2 py-1.5 rounded border border-[color:var(--border-default)] text-center font-mono">
                      {c}
                    </code>
                  ))}
                </div>
              </div>
              {msg && <p className={msgCls(msg.type)}>{msg.text}</p>}
              <div className="flex justify-end">
                <button onClick={reset} className="glass-button-primary text-sm">Done</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
