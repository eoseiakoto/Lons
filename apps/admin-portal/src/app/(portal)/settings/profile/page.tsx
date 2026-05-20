'use client';

import { useState, useEffect } from 'react';
import { gql, useQuery, useMutation } from '@apollo/client';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n/i18n-context';
import { StatusBadge } from '@/components/ui/status-badge';
import { User, Phone, Mail, Shield, Key, ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { MfaCard } from './mfa-card';

const ME_QUERY = gql`
  query Me {
    me {
      id email name phone role { id name } mfaEnabled status lastLoginAt createdAt updatedAt
    }
  }
`;

const UPDATE_PROFILE = gql`
  mutation UpdateMyProfile($input: UpdateMyProfileInput!) {
    updateMyProfile(input: $input) {
      id email name phone role { id name } mfaEnabled status updatedAt
    }
  }
`;

const CHANGE_PASSWORD = gql`
  mutation ChangePassword($currentPassword: String!, $newPassword: String!) {
    changePassword(currentPassword: $currentPassword, newPassword: $newPassword)
  }
`;

export default function ProfilePage() {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const { t } = useI18n();

  const { data, loading, refetch } = useQuery(ME_QUERY);
  const [updateProfile, { loading: saving }] = useMutation(UPDATE_PROFILE);
  const [changePassword, { loading: changingPw }] = useMutation(CHANGE_PASSWORD);

  // Profile form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const me = data?.me;

  useEffect(() => {
    if (me) {
      setName(me.name || '');
      setEmail(me.email || '');
      setPhone(me.phone || '');
    }
  }, [me]);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    try {
      const input: Record<string, string> = {};
      if (name !== (me?.name || '')) input.name = name;
      if (email !== (me?.email || '')) input.email = email;
      if (phone !== (me?.phone || '')) input.phone = phone;

      if (Object.keys(input).length === 0) {
        setProfileMsg({ type: 'error', text: t('settings.profile.noChangesToSave') });
        return;
      }

      await updateProfile({ variables: { input } });
      await refetch();
      await refreshUser();
      setProfileMsg({ type: 'success', text: t('settings.profile.profileUpdated') });
    } catch (err: any) {
      setProfileMsg({ type: 'error', text: err?.graphQLErrors?.[0]?.message || t('settings.profile.profileUpdateFailed') });
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);

    if (newPassword.length < 12) {
      setPwMsg({ type: 'error', text: t('settings.profile.passwordMin12') });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwMsg({ type: 'error', text: t('settings.profile.newPasswordsNoMatch') });
      return;
    }
    if (currentPassword === newPassword) {
      setPwMsg({ type: 'error', text: t('settings.profile.newPasswordMustDiffer') });
      return;
    }

    try {
      await changePassword({ variables: { currentPassword, newPassword } });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwMsg({ type: 'success', text: t('settings.profile.passwordChanged') });
    } catch (err: any) {
      setPwMsg({ type: 'error', text: err?.graphQLErrors?.[0]?.message || t('settings.profile.passwordChangeFailed') });
    }
  };

  const labelCls = 'block text-sm font-medium text-[color:var(--text-secondary)] mb-1.5';
  const msgCls = (type: 'success' | 'error') =>
    type === 'success' ? 'text-sm text-[color:var(--status-success-text)]' : 'text-sm text-[color:var(--status-error-text)]';

  return (
    <div className="relative max-w-3xl space-y-8 animate-enter">
      <button
        onClick={() => router.push('/settings')}
        className="relative z-10 inline-flex items-center gap-1.5 text-[12px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        {t('common.back')}
      </button>

      <PageHeader
        eyebrow={t('eyebrow.accountProfile')}
        title={t('settings.profile.title')}
        subtitle={t('settings.profile.subtitle')}
      />

      {loading ? (
        <div className="card-glow p-12 text-center text-sm text-[color:var(--text-tertiary)]">{t('common.loading')}</div>
      ) : (
        <div className="space-y-4">
          {/* Profile Info Card */}
          <div className="card-glow p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-full bg-[color:var(--accent-primary-soft)] border border-[color:var(--accent-primary-soft)] flex items-center justify-center">
                <User className="w-7 h-7 text-[color:var(--accent-primary-deep)]" />
              </div>
              <div>
                <h2 className="text-[color:var(--text-primary)] font-medium">{me?.name || me?.email || t('settings.profile.userFallback')}</h2>
                <p className="text-sm text-[color:var(--text-tertiary)]">{me?.role?.name?.replace(/_/g, ' ')}</p>
              </div>
              <div className="ml-auto">
                <StatusBadge status={me?.status || 'active'} />
              </div>
            </div>

            <form onSubmit={handleProfileSave} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>
                    <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> {t('settings.profile.fullName')}</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setProfileMsg(null); }}
                    className="w-full glass-input"
                    placeholder={t('settings.profile.fullNamePlaceholder')}
                  />
                </div>
                <div>
                  <label className={labelCls}>
                    <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {t('settings.profile.email')}</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setProfileMsg(null); }}
                    className="w-full glass-input"
                    placeholder={t('settings.profile.emailPlaceholder')}
                    required
                  />
                </div>
                <div>
                  <label className={labelCls}>
                    <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {t('settings.profile.phone')}</span>
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value); setProfileMsg(null); }}
                    className="w-full glass-input"
                    placeholder={t('settings.profile.phonePlaceholder')}
                  />
                </div>
                <div>
                  <label className={labelCls}>
                    <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> {t('settings.profile.role')}</span>
                  </label>
                  <input
                    type="text"
                    value={me?.role?.name?.replace(/_/g, ' ') || ''}
                    className="w-full glass-input text-[color:var(--text-tertiary)] cursor-not-allowed"
                    disabled
                  />
                  <p className="text-xs text-[color:var(--text-tertiary)] mt-1">{t('settings.profile.roleChangeNote')}</p>
                </div>
              </div>

              {profileMsg && <p className={msgCls(profileMsg.type)}>{profileMsg.text}</p>}

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="glass-button-primary text-sm disabled:opacity-50"
                >
                  {saving ? t('common.saving') : t('settings.profile.saveChanges')}
                </button>
              </div>
            </form>
          </div>

          {/* Change Password Card */}
          <div className="card-glow p-6">
            <div className="flex items-center gap-2 mb-4">
              <Key className="w-5 h-5 text-[color:var(--text-secondary)]" />
              <h2 className="text-[color:var(--text-primary)] font-medium">{t('settings.profile.changePassword')}</h2>
            </div>

            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label className={labelCls}>{t('settings.profile.currentPassword')}</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => { setCurrentPassword(e.target.value); setPwMsg(null); }}
                  className="w-full glass-input"
                  placeholder={t('settings.profile.currentPasswordPlaceholder')}
                  required
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>{t('settings.profile.newPassword')}</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => { setNewPassword(e.target.value); setPwMsg(null); }}
                    className="w-full glass-input"
                    placeholder={t('settings.profile.newPasswordPlaceholder')}
                    required
                    minLength={12}
                  />
                </div>
                <div>
                  <label className={labelCls}>{t('settings.profile.confirmNewPassword')}</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setPwMsg(null); }}
                    className="w-full glass-input"
                    placeholder={t('settings.profile.confirmPasswordPlaceholder')}
                    required
                  />
                </div>
              </div>
              <p className="text-xs text-[color:var(--text-tertiary)]">{t('settings.profile.passwordRequirements')}</p>

              {pwMsg && <p className={msgCls(pwMsg.type)}>{pwMsg.text}</p>}

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={changingPw}
                  className="glass-button-primary text-sm disabled:opacity-50"
                >
                  {changingPw ? t('settings.profile.changingPassword') : t('settings.profile.changePassword')}
                </button>
              </div>
            </form>
          </div>

          {/* Two-Factor Authentication */}
          <MfaCard mfaEnabled={!!me?.mfaEnabled} onChange={() => { refetch(); }} />

          {/* Account Details */}
          <div className="card-glow p-6">
            <h2 className="text-[color:var(--text-primary)] font-medium mb-4">{t('settings.profile.accountDetails')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-[color:var(--text-tertiary)]">{t('settings.profile.memberSince')}</span>
                <p className="text-[color:var(--text-primary)] mt-1">{me?.createdAt ? new Date(me.createdAt).toLocaleDateString() : '-'}</p>
              </div>
              <div>
                <span className="text-[color:var(--text-tertiary)]">{t('settings.profile.lastLogin')}</span>
                <p className="text-[color:var(--text-primary)] mt-1">{me?.lastLoginAt ? new Date(me.lastLoginAt).toLocaleDateString() : t('common.never')}</p>
              </div>
              <div>
                <span className="text-[color:var(--text-tertiary)]">{t('settings.profile.lastUpdated')}</span>
                <p className="text-[color:var(--text-primary)] mt-1">{me?.updatedAt ? new Date(me.updatedAt).toLocaleDateString() : '-'}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
