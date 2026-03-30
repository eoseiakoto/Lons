'use client';

import { useAuth } from '@/lib/auth-context';

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-white/40">Loading...</div>
      </div>
    );
  }

  if (!user || user.role !== 'platform_admin') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="glass p-8 text-center max-w-md">
          <h2 className="text-xl font-semibold text-white mb-2">Access Denied</h2>
          <p className="text-white/50 text-sm">
            You do not have permission to access the platform administration area.
            This section requires the <span className="text-white/70 font-medium">platform_admin</span> role.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
