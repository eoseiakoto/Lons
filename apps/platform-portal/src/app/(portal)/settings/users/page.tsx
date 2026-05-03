'use client';

import { useState } from 'react';
import { gql, useQuery, useMutation } from '@apollo/client';
import { useRouter } from 'next/navigation';
import { DataTable } from '@/components/ui/data-table';
import { StatusBadge } from '@/components/ui/status-badge';
import { Drawer } from '@/components/ui/drawer';
import { UserPlus } from 'lucide-react';

const PLATFORM_USERS_QUERY = gql`
  query PlatformUsers($pagination: PaginationInput) {
    platformUsers(pagination: $pagination) {
      edges {
        node { id email name role mfaEnabled status lastLoginAt createdAt }
      }
      pageInfo { hasNextPage endCursor }
      totalCount
    }
  }
`;

const CREATE_PLATFORM_USER = gql`
  mutation CreatePlatformUser($input: CreatePlatformUserInput!) {
    createPlatformUser(input: $input) { id email name role status }
  }
`;

const UPDATE_PLATFORM_USER = gql`
  mutation UpdatePlatformUser($id: ID!, $input: UpdatePlatformUserInput!) {
    updatePlatformUser(id: $id, input: $input) { id email name role status }
  }
`;

const DEACTIVATE_PLATFORM_USER = gql`
  mutation DeactivatePlatformUser($id: ID!) {
    deactivatePlatformUser(id: $id) { id status }
  }
`;

const RESET_PLATFORM_USER_PASSWORD = gql`
  mutation ResetPlatformUserPassword($id: ID!, $newPassword: String!) {
    resetPlatformUserPassword(id: $id, newPassword: $newPassword) { id }
  }
`;

interface PlatformUserNode {
  id: string;
  email: string;
  name?: string;
  role: string;
  mfaEnabled: boolean;
  status: string;
  lastLoginAt?: string;
  createdAt: string;
}

const ROLE_OPTIONS = [
  { value: 'platform_admin', label: 'Platform Admin' },
  { value: 'platform_support', label: 'Platform Support' },
];

export default function PlatformUsersPage() {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editUser, setEditUser] = useState<PlatformUserNode | null>(null);
  const [formError, setFormError] = useState('');

  // Form state
  const [formEmail, setFormEmail] = useState('');
  const [formName, setFormName] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState('platform_support');
  const [formStatus, setFormStatus] = useState('active');

  // Reset password state
  const [resetOpen, setResetOpen] = useState(false);
  const [resetPw, setResetPw] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);

  // Deactivate confirmation state
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  const { data, loading, refetch } = useQuery(PLATFORM_USERS_QUERY, {
    variables: { pagination: { first: 50 } },
  });

  const [createUser, { loading: creating }] = useMutation(CREATE_PLATFORM_USER);
  const [updateUser, { loading: updating }] = useMutation(UPDATE_PLATFORM_USER);
  const [deactivateUser] = useMutation(DEACTIVATE_PLATFORM_USER);
  const [resetPassword, { loading: resetting }] = useMutation(RESET_PLATFORM_USER_PASSWORD);

  const users: PlatformUserNode[] = data?.platformUsers?.edges?.map((e: any) => e.node) || [];

  const openCreate = () => {
    setEditUser(null);
    setFormEmail('');
    setFormName('');
    setFormPassword('');
    setFormRole('platform_support');
    setFormStatus('active');
    setFormError('');
    setConfirmDeactivate(false);
    setDrawerOpen(true);
  };

  const openEdit = (user: PlatformUserNode) => {
    setEditUser(user);
    setFormEmail(user.email);
    setFormName(user.name || '');
    setFormPassword('');
    setFormRole(user.role);
    setFormStatus(user.status);
    setFormError('');
    setResetOpen(false);
    setResetPw('');
    setResetConfirm('');
    setResetError('');
    setResetSuccess(false);
    setConfirmDeactivate(false);
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
              role: formRole !== editUser.role ? formRole : undefined,
              status: formStatus !== editUser.status ? formStatus : undefined,
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
              role: formRole,
            },
          },
        });
      }
      setDrawerOpen(false);
      refetch();
    } catch (err: any) {
      const msg = err?.graphQLErrors?.[0]?.message || err?.message || 'Operation failed';
      setFormError(msg);
    }
  };

  const handleDeactivate = async (userId: string) => {
    try {
      await deactivateUser({ variables: { id: userId } });
      setDrawerOpen(false);
      refetch();
    } catch (err: any) {
      setFormError(err?.graphQLErrors?.[0]?.message || 'Deactivation failed');
    }
  };

  const formatRole = (role: string) => {
    return role === 'platform_admin' ? 'Platform Admin' : 'Platform Support';
  };

  return (
    <div className="space-y-8 animate-enter">
      <button onClick={() => router.push('/settings')} className="text-sm text-[color:var(--accent-primary-deep)] hover:underline">&larr; Back</button>
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-[color:var(--text-primary)]">Platform Users</h1>
          <p className="text-[15px] text-[color:var(--text-secondary)] mt-2">Manage platform administrator and support accounts</p>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2 text-sm">
          <UserPlus className="w-4 h-4" />
          Add User
        </button>
      </header>

      {loading ? (
        <div className="text-sm text-[color:var(--text-secondary)]">Loading...</div>
      ) : (
        <div className="card-flush overflow-hidden" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <DataTable
            columns={[
              { header: 'Name', accessor: (r: PlatformUserNode) => r.name || '-' },
              { header: 'Email', accessor: 'email' },
              { header: 'Role', accessor: (r: PlatformUserNode) => formatRole(r.role) },
              { header: 'MFA', accessor: (r: PlatformUserNode) => r.mfaEnabled ? 'Enabled' : 'Off' },
              {
                header: 'Last Login',
                accessor: (r: PlatformUserNode) =>
                  r.lastLoginAt ? new Date(r.lastLoginAt).toLocaleDateString() : 'Never',
              },
              { header: 'Status', accessor: (r: PlatformUserNode) => <StatusBadge status={r.status} /> },
            ]}
            data={users}
            onRowClick={(r: PlatformUserNode) => openEdit(r)}
          />
        </div>
      )}

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={editUser ? 'Edit Platform User' : 'Create Platform User'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[color:var(--text-secondary)] mb-1">Name</label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="w-full glass-input"
              placeholder="Full name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[color:var(--text-secondary)] mb-1">Email</label>
            <input
              type="email"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
              className="w-full glass-input"
              placeholder="user@example.com"
              required
            />
          </div>
          {!editUser && (
            <div>
              <label className="block text-sm font-medium text-[color:var(--text-secondary)] mb-1">Password</label>
              <input
                type="password"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                className="w-full glass-input"
                placeholder="Min 12 chars, uppercase, lowercase, digit, special"
                required
                minLength={12}
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-[color:var(--text-secondary)] mb-1">Role</label>
            <select
              value={formRole}
              onChange={(e) => setFormRole(e.target.value)}
              className="w-full glass-input"
              required
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {editUser && (
            <div>
              <label className="block text-sm font-medium text-[color:var(--text-secondary)] mb-1">Status</label>
              <select
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value)}
                className="w-full glass-input"
              >
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          )}

          {formError && <p className="text-sm text-[color:var(--status-error-text)]">{formError}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={creating || updating}
              className="flex-1 glass-button-primary disabled:opacity-50"
            >
              {creating || updating ? 'Saving...' : editUser ? 'Update User' : 'Create User'}
            </button>
            {editUser && editUser.status === 'active' && (
              <>
                {!confirmDeactivate ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDeactivate(true)}
                    className="px-4 py-2 bg-[color:var(--status-error-soft)] border border-[color:var(--status-error)] text-[color:var(--status-error-text)] rounded-lg hover:opacity-80 transition-colors text-sm"
                  >
                    Deactivate
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleDeactivate(editUser.id)}
                      className="px-4 py-2 bg-[color:var(--status-error-soft)] border border-[color:var(--status-error)] text-[color:var(--status-error-text)] rounded-lg hover:opacity-80 transition-colors text-sm font-medium"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeactivate(false)}
                      className="px-3 py-2 text-sm text-[color:var(--text-tertiary)] hover:text-[color:var(--text-secondary)] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </form>

        {editUser && (
          <div className="mt-6 pt-6 border-t border-[color:var(--border-subtle)] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-[color:var(--text-secondary)]">Reset Password</h3>
              {!resetOpen && (
                <button
                  type="button"
                  onClick={() => { setResetOpen(true); setResetSuccess(false); }}
                  className="text-xs text-[color:var(--accent-primary-deep)] hover:text-[color:var(--accent-primary-hover)] transition-colors"
                >
                  Reset Password
                </button>
              )}
            </div>
            {resetOpen && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-[color:var(--text-tertiary)] mb-1">New Password</label>
                  <input
                    type="password"
                    value={resetPw}
                    onChange={(e) => { setResetPw(e.target.value); setResetError(''); setResetSuccess(false); }}
                    className="w-full glass-input text-sm"
                    placeholder="Min 12 chars, uppercase, lowercase, digit, special"
                    minLength={12}
                  />
                </div>
                <div>
                  <label className="block text-xs text-[color:var(--text-tertiary)] mb-1">Confirm Password</label>
                  <input
                    type="password"
                    value={resetConfirm}
                    onChange={(e) => { setResetConfirm(e.target.value); setResetError(''); }}
                    className="w-full glass-input text-sm"
                    placeholder="Confirm new password"
                  />
                </div>
                {resetError && <p className="text-xs text-[color:var(--status-error-text)]">{resetError}</p>}
                {resetSuccess && <p className="text-xs text-[color:var(--status-success-text)]">Password was reset successfully</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={resetting}
                    onClick={async () => {
                      setResetError('');
                      setResetSuccess(false);
                      if (!resetPw) { setResetError('Password is required'); return; }
                      if (resetPw !== resetConfirm) { setResetError('Passwords do not match'); return; }
                      try {
                        await resetPassword({ variables: { id: editUser.id, newPassword: resetPw } });
                        setResetPw('');
                        setResetConfirm('');
                        setResetSuccess(true);
                        setResetOpen(false);
                      } catch (err: any) {
                        setResetError(err?.graphQLErrors?.[0]?.message || 'Password reset failed');
                      }
                    }}
                    className="flex-1 glass-button-primary text-sm disabled:opacity-50"
                  >
                    {resetting ? 'Resetting...' : 'Reset Password'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setResetOpen(false); setResetPw(''); setResetConfirm(''); setResetError(''); }}
                    className="px-3 py-2 text-sm text-[color:var(--text-tertiary)] hover:text-[color:var(--text-secondary)] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {resetSuccess && !resetOpen && <p className="text-xs text-[color:var(--status-success-text)]">Password was reset successfully</p>}
          </div>
        )}

        {editUser && (
          <div className="mt-6 pt-6 border-t border-[color:var(--border-subtle)] space-y-3">
            <h3 className="text-sm font-medium text-[color:var(--text-secondary)]">User Details</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-[color:var(--text-tertiary)]">Status</span>
                <div className="mt-1"><StatusBadge status={editUser.status} /></div>
              </div>
              <div>
                <span className="text-[color:var(--text-tertiary)]">MFA</span>
                <p className="text-[color:var(--text-primary)] mt-1">{editUser.mfaEnabled ? 'Enabled' : 'Disabled'}</p>
              </div>
              <div>
                <span className="text-[color:var(--text-tertiary)]">Created</span>
                <p className="text-[color:var(--text-primary)] mt-1">{new Date(editUser.createdAt).toLocaleDateString()}</p>
              </div>
              <div>
                <span className="text-[color:var(--text-tertiary)]">Last Login</span>
                <p className="text-[color:var(--text-primary)] mt-1">
                  {editUser.lastLoginAt ? new Date(editUser.lastLoginAt).toLocaleDateString() : 'Never'}
                </p>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
