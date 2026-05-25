'use client';

import { useState, useEffect } from 'react';
import { gql, useQuery, useMutation } from '@apollo/client';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { StatusBadge } from '@/components/ui/status-badge';
import { User, Mail, Shield, Key } from 'lucide-react';
import { MfaCard } from './mfa-card';

const PLATFORM_ME_QUERY = gql`
  query PlatformMe {
    platformMe {
      id
      email
      name
      role
      mfaEnabled
      status
      lastLoginAt
      createdAt
      updatedAt
    }
  }
`;

const UPDATE_PLATFORM_PROFILE = gql`
  mutation UpdatePlatformMyProfile($input: UpdatePlatformMyProfileInput!) {
    updatePlatformMyProfile(input: $input) {
      id
      email
      name
      role
      mfaEnabled
      status
      updatedAt
    }
  }
`;

const CHANGE_PLATFORM_PASSWORD = gql`
  mutation ChangePlatformPassword($currentPassword: String!, $newPassword: String!) {
    changePlatformPassword(currentPassword: $currentPassword, newPassword: $newPassword)
  }
`;

export default function ProfilePage() {
  const router = useRouter();
  useAuth();

  const { data, loading, refetch } = useQuery(PLATFORM_ME_QUERY);
  const [updateProfile, { loading: saving }] = useMutation(UPDATE_PLATFORM_PROFILE);
  const [changePassword, { loading: changingPw }] = useMutation(CHANGE_PLATFORM_PASSWORD);

  // Profile form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const me = data?.platformMe;

  useEffect(() => {
    if (me) {
      setName(me.name || '');
      setEmail(me.email || '');
    }
  }, [me]);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    try {
      const input: Record<string, string> = {};
      if (name !== (me?.name || '')) input.name = name;
      if (email !== (me?.email || '')) input.email = email;

      if (Object.keys(input).length === 0) {
        setProfileMsg({ type: 'error', text: 'No changes to save.' });
        return;
      }

      await updateProfile({ variables: { input } });
      await refetch();
      setProfileMsg({ type: 'success', text: 'Profile updated successfully.' });
    } catch (err: any) {
      setProfileMsg({ type: 'error', text: err?.graphQLErrors?.[0]?.message || 'Failed to update profile.' });
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);

    if (newPassword.length < 12) {
      setPwMsg({ type: 'error', text: 'Password must be at least 12 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwMsg({ type: 'error', text: 'New passwords do not match.' });
      return;
    }
    if (currentPassword === newPassword) {
      setPwMsg({ type: 'error', text: 'New password must be different from current password.' });
      return;
    }

    try {
      await changePassword({ variables: { currentPassword, newPassword } });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwMsg({ type: 'success', text: 'Password changed successfully.' });
    } catch (err: any) {
      setPwMsg({ type: 'error', text: err?.graphQLErrors?.[0]?.message || 'Failed to change password.' });
    }
  };

  const labelCls = 'block text-sm font-medium text-[color:var(--text-secondary)] mb-1.5';
  const msgCls = (type: 'success' | 'error') =>
    type === 'success' ? 'text-sm text-[color:var(--status-success-text)]' : 'text-sm text-[color:var(--status-error-text)]';

  return (
    <div className="max-w-2xl space-y-8 animate-enter">
      <button onClick={() => router.push('/settings')} className="text-sm text-[color:var(--accent-primary-deep)] hover:underline">
        &larr; Back to Settings
      </button>
      <header>
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">My Profile</h1>
        <p className="text-[15px] text-[color:var(--text-secondary)] mt-2">Update your personal information.</p>
      </header>

      {loading ? (
        <div className="text-[color:var(--text-tertiary)]">Loading...</div>
      ) : (
        <div className="space-y-6">
          {/* Profile Info Card */}
          <div className="card p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-full bg-[color:var(--accent-primary-soft)] border border-[color:var(--accent-primary-soft)] flex items-center justify-center">
                <User className="w-7 h-7 text-[color:var(--accent-primary-deep)]" />
              </div>
              <div>
                <h2 className="text-[color:var(--text-primary)] font-medium">{me?.name || me?.email || 'User'}</h2>
                <p className="text-sm text-[color:var(--text-tertiary)] capitalize">{me?.role?.replace(/_/g, ' ')}</p>
              </div>
              <div className="ml-auto">
                <StatusBadge status={me?.status || 'active'} />
              </div>
            </div>

            <form onSubmit={handleProfileSave} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>
                    <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Full Name</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setProfileMsg(null); }}
                    className="w-full glass-input"
                    placeholder="Your full name"
                  />
                </div>
                <div>
                  <label className={labelCls}>
                    <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Email</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setProfileMsg(null); }}
                    className="w-full glass-input"
                    placeholder="your@email.com"
                    required
                  />
                </div>
                <div>
                  <label className={labelCls}>
                    <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> Role</span>
                  </label>
                  <input
                    type="text"
                    value={me?.role?.replace(/_/g, ' ') || ''}
                    className="w-full glass-input text-[color:var(--text-tertiary)] cursor-not-allowed capitalize"
                    disabled
                  />
                  <p className="text-xs text-[color:var(--text-tertiary)] mt-1">Role can only be changed by another platform admin.</p>
                </div>
              </div>

              {profileMsg && <p className={msgCls(profileMsg.type)}>{profileMsg.text}</p>}

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="glass-button-primary text-sm disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>

          {/* Change Password Card */}
          <div className="card p-6">
            <div className="flex items-center gap-2 mb-4">
              <Key className="w-5 h-5 text-[color:var(--text-secondary)]" />
              <h2 className="text-[color:var(--text-primary)] font-medium">Change Password</h2>
            </div>

            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label className={labelCls}>Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => { setCurrentPassword(e.target.value); setPwMsg(null); }}
                  className="w-full glass-input"
                  placeholder="Enter current password"
                  required
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setPwMsg(null); }}
                    className="w-full glass-input"
                    placeholder="Min 12 characters"
                    required
                    minLength={12}
                  />
                </div>
                <div>
                  <label className={labelCls}>Confirm New Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setPwMsg(null); }}
                    className="w-full glass-input"
                    placeholder="Re-enter new password"
                    required
                  />
                </div>
              </div>
              <p className="text-xs text-[color:var(--text-tertiary)]">Password must be at least 12 characters with uppercase, lowercase, number, and special character.</p>

              {pwMsg && <p className={msgCls(pwMsg.type)}>{pwMsg.text}</p>}

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={changingPw}
                  className="glass-button-primary text-sm disabled:opacity-50"
                >
                  {changingPw ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </form>
          </div>

          {/* Two-Factor Authentication */}
          <MfaCard mfaEnabled={!!me?.mfaEnabled} onChange={() => { refetch(); }} />

          {/* Account Details */}
          <div className="card p-6">
            <h2 className="text-[color:var(--text-primary)] font-medium mb-4">Account Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-[color:var(--text-tertiary)]">Member Since</span>
                <p className="text-[color:var(--text-primary)] mt-1">{me?.createdAt ? new Date(me.createdAt).toLocaleDateString() : '-'}</p>
              </div>
              <div>
                <span className="text-[color:var(--text-tertiary)]">Last Login</span>
                <p className="text-[color:var(--text-primary)] mt-1">{me?.lastLoginAt ? new Date(me.lastLoginAt).toLocaleDateString() : 'Never'}</p>
              </div>
              <div>
                <span className="text-[color:var(--text-tertiary)]">Last Updated</span>
                <p className="text-[color:var(--text-primary)] mt-1">{me?.updatedAt ? new Date(me.updatedAt).toLocaleDateString() : '-'}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
