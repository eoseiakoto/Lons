'use client';

import { useState } from 'react';
import { gql, useQuery, useMutation } from '@apollo/client';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/i18n-context';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { Drawer } from '@/components/ui/drawer';
import { UserPlus, ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';

const USERS_QUERY = gql`
  query Users($pagination: PaginationInput) {
    users(pagination: $pagination) {
      edges {
        node {
          id email name role { id name } mfaEnabled status lastLoginAt createdAt
          # S19-STAB-5: tier-aware MFA compliance status — drives the
          # badge column. Resolved by UserResolver.mfaCompliance on the
          # backend; null only when compliance data can't be computed.
          mfaCompliance {
            status
            graceDaysRemaining
          }
        }
      }
      pageInfo { hasNextPage endCursor }
      totalCount
    }
  }
`;

const ROLES_QUERY = gql`
  query Roles {
    roles { id name description isSystem }
  }
`;

const CREATE_USER = gql`
  mutation CreateUser($input: CreateUserInput!) {
    createUser(input: $input) { id email name role { id name } status }
  }
`;

const UPDATE_USER = gql`
  mutation UpdateUser($id: ID!, $input: UpdateUserInput!) {
    updateUser(id: $id, input: $input) { id email name role { id name } status }
  }
`;

const DEACTIVATE_USER = gql`
  mutation DeactivateUser($id: ID!) {
    deactivateUser(id: $id) { id status }
  }
`;

const RESET_PASSWORD = gql`
  mutation AdminResetPassword($id: ID!, $newPassword: String!) {
    adminResetPassword(id: $id, newPassword: $newPassword) { id }
  }
`;

/**
 * MFA-lockout fix: admin recovery for a user whose MFA is
 * unrecoverable (lost phone, locked out by tier enforcement).
 * Argument is `id` (not `userId`) to match the backend resolver
 * signature in apps/graphql-server/src/graphql/resolvers/user.resolver.ts.
 * The mutation also returns mfaEnabled so the UI can confirm the
 * post-reset state — though we additionally refetch the users
 * query to update the MFA Compliance badge on the row.
 */
const RESET_MFA = gql`
  mutation AdminResetUserMfa($id: ID!) {
    adminResetUserMfa(id: $id) { id mfaEnabled }
  }
`;

type MfaComplianceStatus = 'not_required' | 'enrolled' | 'pending' | 'overdue';

interface UserNode {
  id: string;
  email: string;
  name?: string;
  role: { id: string; name: string };
  mfaEnabled: boolean;
  status: string;
  lastLoginAt?: string;
  createdAt: string;
  // S19-STAB-5: server-computed MFA compliance — null when not
  // available (older API, missing data, or compliance service
  // wasn't wired).
  mfaCompliance?: {
    status: MfaComplianceStatus;
    graceDaysRemaining: number | null;
  } | null;
}

/**
 * S19-STAB-5 — colour-coded badge for the MFA column. Maps the four
 * compliance states to design-system status tokens. Falls back to
 * a "—" when the field is null (compliance couldn't be computed).
 */
function MfaComplianceBadge({
  compliance,
  t,
}: {
  compliance?: UserNode['mfaCompliance'];
  t: (k: string) => string;
}) {
  if (!compliance) return <span className="text-[color:var(--text-tertiary)]">—</span>;

  const styles: Record<MfaComplianceStatus, { bg: string; color: string; border: string; label: string }> = {
    enrolled: {
      bg: 'var(--status-success-soft)',
      color: 'var(--status-success-text)',
      border: 'var(--status-success)',
      label: t('settings.users.mfaCompliance.enrolled'),
    },
    not_required: {
      bg: 'var(--bg-muted)',
      color: 'var(--text-secondary)',
      border: 'var(--border-subtle)',
      label: t('settings.users.mfaCompliance.notRequired'),
    },
    pending: {
      bg: 'var(--status-warning-soft)',
      color: 'var(--status-warning-text)',
      border: 'var(--status-warning)',
      label:
        compliance.graceDaysRemaining !== null && compliance.graceDaysRemaining >= 0
          ? `${t('settings.users.mfaCompliance.pending')} (${compliance.graceDaysRemaining}d)`
          : t('settings.users.mfaCompliance.pending'),
    },
    overdue: {
      bg: 'var(--status-error-soft)',
      color: 'var(--status-error-text)',
      border: 'var(--status-error)',
      label: t('settings.users.mfaCompliance.overdue'),
    },
  };
  const s = styles[compliance.status];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium"
      style={{ backgroundColor: s.bg, color: s.color, border: `1px solid ${s.border}` }}
    >
      {s.label}
    </span>
  );
}

interface RoleNode {
  id: string;
  name: string;
  description?: string;
  isSystem: boolean;
}

export default function UsersPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserNode | null>(null);
  const [formError, setFormError] = useState('');

  // Form state
  const [formEmail, setFormEmail] = useState('');
  const [formName, setFormName] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRoleId, setFormRoleId] = useState('');

  // Reset password state
  const [resetOpen, setResetOpen] = useState(false);
  const [resetPw, setResetPw] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);

  // MFA-lockout fix: Reset MFA state. No collapsible "confirm step"
  // (matches the prompt's prescribed pattern — one click + clear
  // help text + success/error feedback). The success flag also
  // gates the button so a user can't double-click after a
  // successful reset.
  const [mfaResetSuccess, setMfaResetSuccess] = useState(false);
  const [mfaResetError, setMfaResetError] = useState('');

  const { data, loading, refetch } = useQuery(USERS_QUERY, {
    variables: { pagination: { first: 50 } },
  });
  const { data: rolesData } = useQuery(ROLES_QUERY);

  const [createUser, { loading: creating }] = useMutation(CREATE_USER);
  const [updateUser, { loading: updating }] = useMutation(UPDATE_USER);
  const [deactivateUser] = useMutation(DEACTIVATE_USER);
  const [resetPassword, { loading: resetting }] = useMutation(RESET_PASSWORD);
  const [resetMfa, { loading: resettingMfa }] = useMutation(RESET_MFA);

  const users: UserNode[] = data?.users?.edges?.map((e: any) => e.node) || [];
  const roles: RoleNode[] = rolesData?.roles || [];

  const openCreate = () => {
    setEditUser(null);
    setFormEmail('');
    setFormName('');
    setFormPassword('');
    setFormRoleId(roles[0]?.id || '');
    setFormError('');
    setDrawerOpen(true);
  };

  const openEdit = (user: UserNode) => {
    setEditUser(user);
    setFormEmail(user.email);
    setFormName(user.name || '');
    setFormPassword('');
    setFormRoleId(user.role.id);
    setFormError('');
    setResetOpen(false);
    setResetPw('');
    setResetConfirm('');
    setResetError('');
    setResetSuccess(false);
    // MFA-lockout fix: clear the reset-MFA feedback when switching
    // users so stale success/error from a previous user doesn't
    // bleed into the next drawer open.
    setMfaResetSuccess(false);
    setMfaResetError('');
    setDrawerOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    try {
      if (editUser) {
        await updateUser({
          variables: {
            id: editUser.id,
            input: {
              email: formEmail !== editUser.email ? formEmail : undefined,
              name: formName || undefined,
              roleId: formRoleId !== editUser.role.id ? formRoleId : undefined,
            },
          },
        });
      } else {
        await createUser({
          variables: {
            input: {
              email: formEmail,
              password: formPassword,
              name: formName || undefined,
              roleId: formRoleId,
            },
          },
        });
      }
      setDrawerOpen(false);
      refetch();
    } catch (err: any) {
      const msg = err?.graphQLErrors?.[0]?.message || err?.message || t('settings.users.operationFailed');
      setFormError(msg);
    }
  };

  const handleDeactivate = async (userId: string) => {
    try {
      await deactivateUser({ variables: { id: userId } });
      setDrawerOpen(false);
      refetch();
    } catch (err: any) {
      setFormError(err?.graphQLErrors?.[0]?.message || t('settings.users.deactivationFailed'));
    }
  };

  return (
    <div className="relative space-y-8 animate-enter">
      <button
        onClick={() => router.push('/settings')}
        className="relative z-10 inline-flex items-center gap-1.5 text-[12px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        {t('common.back')}
      </button>

      <PageHeader
        eyebrow={t('eyebrow.accessUsers')}
        title={t('settings.users.title')}
        subtitle={`${data?.users?.totalCount ?? 0} ${(data?.users?.totalCount ?? 0) === 1 ? t('settings.users.userWithAccess') : t('settings.users.usersWithAccess')}`}
        actions={
          <button onClick={openCreate} className="btn-primary">
            <UserPlus className="w-4 h-4" />
            {t('settings.users.addUser')}
          </button>
        }
      />

      {loading ? (
        <div className="relative z-10 card-glow p-12 text-center text-sm text-[color:var(--text-tertiary)]">{t('common.loading')}</div>
      ) : (
        <div className="relative z-10 card-glow overflow-hidden">
          <DataTable
            columns={[
              { header: t('settings.users.name'), accessor: (r: UserNode) => r.name || '-' },
              { header: t('settings.users.email'), accessor: 'email' },
              { header: t('settings.users.role'), accessor: (r: UserNode) => r.role.name },
              {
                header: t('settings.users.lastLogin'),
                accessor: (r: UserNode) =>
                  r.lastLoginAt ? new Date(r.lastLoginAt).toLocaleDateString() : t('common.never'),
              },
              { header: t('settings.users.mfa'), accessor: (r: UserNode) => r.mfaEnabled ? t('common.enabled') : t('settings.users.off') },
              // S19-STAB-5: tier-policy compliance column. Surfaces
              // pending grace countdowns (e.g. "Pending (3d)") and
              // hard-overdue users that the next login will block.
              {
                header: t('settings.users.mfaCompliance.column'),
                accessor: (r: UserNode) => <MfaComplianceBadge compliance={r.mfaCompliance} t={t} />,
              },
              { header: t('settings.users.status'), accessor: (r: UserNode) => <StatusBadge status={r.status} /> },
            ]}
            data={users}
            onRowClick={(r: UserNode) => openEdit(r)}
          />
        </div>
      )}

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={editUser ? t('settings.users.editUser') : t('settings.users.createUser')}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[color:var(--text-secondary)] mb-1">{t('settings.users.name')}</label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="w-full glass-input"
              placeholder={t('settings.users.fullNamePlaceholder')}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[color:var(--text-secondary)] mb-1">{t('settings.users.email')}</label>
            <input
              type="email"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
              className="w-full glass-input"
              placeholder={t('settings.users.emailPlaceholder')}
              required
            />
          </div>
          {!editUser && (
            <div>
              <label className="block text-sm font-medium text-[color:var(--text-secondary)] mb-1">{t('settings.users.password')}</label>
              <input
                type="password"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                className="w-full glass-input"
                placeholder={t('settings.users.passwordHelp')}
                required
                minLength={12}
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-[color:var(--text-secondary)] mb-1">{t('settings.users.role')}</label>
            <select
              value={formRoleId}
              onChange={(e) => setFormRoleId(e.target.value)}
              className="w-full glass-input"
              required
            >
              <option value="">{t('settings.users.selectRole')}</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>

          {formError && <p className="text-sm text-[color:var(--status-error-text)]">{formError}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={creating || updating}
              className="flex-1 glass-button-primary disabled:opacity-50"
            >
              {creating || updating ? t('common.saving') : editUser ? t('settings.users.updateUser') : t('settings.users.createUser')}
            </button>
            {editUser && editUser.status === 'active' && (
              <button
                type="button"
                onClick={() => handleDeactivate(editUser.id)}
                className="px-4 py-2 bg-[color:var(--status-error-soft)] border border-[color:var(--status-error)] text-[color:var(--status-error-text)] rounded-lg hover:opacity-80 transition-colors text-sm"
              >
                {t('settings.users.deactivate')}
              </button>
            )}
          </div>
        </form>

        {editUser && (
          <div className="mt-6 pt-6 border-t border-[color:var(--border-subtle)] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-[color:var(--text-secondary)]">{t('settings.users.resetPassword')}</h3>
              {!resetOpen && (
                <button
                  type="button"
                  onClick={() => { setResetOpen(true); setResetSuccess(false); }}
                  className="text-xs text-[color:var(--accent-primary-deep)] hover:text-[color:var(--accent-primary-hover)] transition-colors"
                >
                  {t('settings.users.resetPassword')}
                </button>
              )}
            </div>
            {resetOpen && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-[color:var(--text-tertiary)] mb-1">{t('settings.users.newPassword')}</label>
                  <input
                    type="password"
                    value={resetPw}
                    onChange={(e) => { setResetPw(e.target.value); setResetError(''); setResetSuccess(false); }}
                    className="w-full glass-input text-sm"
                    placeholder={t('settings.users.passwordHelp')}
                    minLength={12}
                  />
                </div>
                <div>
                  <label className="block text-xs text-[color:var(--text-tertiary)] mb-1">{t('settings.users.confirmPassword')}</label>
                  <input
                    type="password"
                    value={resetConfirm}
                    onChange={(e) => { setResetConfirm(e.target.value); setResetError(''); }}
                    className="w-full glass-input text-sm"
                    placeholder={t('settings.users.confirmPasswordPlaceholder')}
                  />
                </div>
                {resetError && <p className="text-xs text-[color:var(--status-error-text)]">{resetError}</p>}
                {resetSuccess && <p className="text-xs text-[color:var(--status-success-text)]">{t('settings.users.resetSuccess')}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={resetting}
                    onClick={async () => {
                      setResetError('');
                      setResetSuccess(false);
                      if (!resetPw) { setResetError(t('settings.users.passwordRequired')); return; }
                      if (resetPw !== resetConfirm) { setResetError(t('settings.users.passwordsDoNotMatch')); return; }
                      try {
                        await resetPassword({ variables: { id: editUser.id, newPassword: resetPw } });
                        setResetPw('');
                        setResetConfirm('');
                        setResetSuccess(true);
                        setResetOpen(false);
                      } catch (err: any) {
                        setResetError(err?.graphQLErrors?.[0]?.message || t('settings.users.passwordResetFailed'));
                      }
                    }}
                    className="flex-1 glass-button-primary text-sm disabled:opacity-50"
                  >
                    {resetting ? t('settings.users.resetting') : t('settings.users.resetPassword')}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setResetOpen(false); setResetPw(''); setResetConfirm(''); setResetError(''); }}
                    className="px-3 py-2 text-sm text-[color:var(--text-tertiary)] hover:text-[color:var(--text-secondary)] transition-colors"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            )}
            {resetSuccess && !resetOpen && <p className="text-xs text-[color:var(--status-success-text)]">{t('settings.users.passwordWasReset')}</p>}
          </div>
        )}

        {/*
          MFA-lockout fix: admin path to reset a user's MFA when
          they're locked out (lost phone, device change, expired
          grace window with no other admin to help). Conditional
          on `mfaEnabled` so the button doesn't appear for users
          who have nothing to reset — but stays mounted after a
          successful reset so the success message remains visible
          until the drawer closes. The visible-after-success
          condition is `(editUser.mfaEnabled || mfaResetSuccess)`.

          Permission gating: the backend mutation is decorated with
          @Roles('user:update'); a non-admin user cannot invoke it
          even if they somehow rendered the button. The audit trail
          via @AuditAction captures (actor, target).
        */}
        {editUser && (editUser.mfaEnabled || mfaResetSuccess) && (
          <div className="mt-6 pt-6 border-t border-[color:var(--border-subtle)] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-[color:var(--text-secondary)]">
                {t('settings.users.resetMfa')}
              </h3>
              {/* Button hides after success so the user can't double-fire. */}
              {!mfaResetSuccess && editUser.mfaEnabled && (
                <button
                  type="button"
                  disabled={resettingMfa}
                  onClick={async () => {
                    setMfaResetError('');
                    setMfaResetSuccess(false);
                    try {
                      await resetMfa({ variables: { id: editUser.id } });
                      setMfaResetSuccess(true);
                      // Refresh the users list so the MFA Compliance
                      // badge on the row updates immediately (the
                      // reset stamps mfaDisabledAt = now, which
                      // restarts the 7-day grace window — the badge
                      // should flip from "Enrolled" to "Pending 7d").
                      refetch();
                    } catch (err: any) {
                      setMfaResetError(
                        err?.graphQLErrors?.[0]?.message ||
                          t('settings.users.mfaResetFailed'),
                      );
                    }
                  }}
                  className="text-xs text-[color:var(--status-warning-text)] hover:text-[color:var(--status-error-text)] disabled:opacity-50 transition-colors"
                >
                  {resettingMfa
                    ? t('settings.users.resettingMfa')
                    : t('settings.users.resetMfa')}
                </button>
              )}
            </div>
            <p className="text-xs text-[color:var(--text-tertiary)]">
              {t('settings.users.resetMfaHelp')}
            </p>
            {mfaResetError && (
              <p className="text-xs text-[color:var(--status-error-text)]">{mfaResetError}</p>
            )}
            {mfaResetSuccess && (
              <p className="text-xs text-[color:var(--status-success-text)]">
                {t('settings.users.mfaWasReset')}
              </p>
            )}
          </div>
        )}

        {editUser && (
          <div className="mt-6 pt-6 border-t border-[color:var(--border-subtle)] space-y-3">
            <h3 className="text-sm font-medium text-[color:var(--text-secondary)]">{t('settings.users.userDetails')}</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-[color:var(--text-tertiary)]">{t('settings.users.status')}</span>
                <div className="mt-1"><StatusBadge status={editUser.status} /></div>
              </div>
              <div>
                <span className="text-[color:var(--text-tertiary)]">{t('settings.users.mfa')}</span>
                <p className="text-[color:var(--text-primary)] mt-1">{editUser.mfaEnabled ? t('common.enabled') : t('common.disabled')}</p>
              </div>
              <div>
                <span className="text-[color:var(--text-tertiary)]">{t('common.created')}</span>
                <p className="text-[color:var(--text-primary)] mt-1">{new Date(editUser.createdAt).toLocaleDateString()}</p>
              </div>
              <div>
                <span className="text-[color:var(--text-tertiary)]">{t('settings.users.lastLogin')}</span>
                <p className="text-[color:var(--text-primary)] mt-1">
                  {editUser.lastLoginAt ? new Date(editUser.lastLoginAt).toLocaleDateString() : t('common.never')}
                </p>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
