'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldAlert, X } from 'lucide-react';
import { MFA_GRACE_KEY } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n/i18n-context';

/**
 * S19-STAB-5 — persistent banner shown while a user is inside the
 * 7-day MFA grace window.
 *
 * Data flow:
 *   - `auth-context.login()` writes `mfaGraceDaysRemaining` to
 *     localStorage under MFA_GRACE_KEY when the server returns it.
 *   - This component reads the value on mount and renders if > 0
 *     (or === 0 — "today is the last day"). Negative numbers are
 *     unreachable here because the server hard-blocks at 0 and below.
 *   - User can dismiss-for-this-session via the X button; we set a
 *     sessionStorage flag so dismiss-on-tab-close-still-resurfaces.
 *   - The banner self-clears once the user enrols (next login the
 *     server returns no `mfaGraceDaysRemaining`, login flow removes
 *     the key).
 *
 * Why localStorage + a static banner (rather than a top-of-page
 * useQuery) — the grace info comes from the login response, which
 * lives in the cache for that one mutation. A subscription-style
 * "always-fresh days remaining" would require a recurring query;
 * for this MVP, the figure refreshes on every login, which is
 * sufficient for the 7-day window. If the figure drifts (laptop
 * left open for days), worst case the banner is stale by one day
 * — the server hard-blocks at the real expiry regardless.
 */
export function MfaGraceBanner() {
  const { t } = useI18n();
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(MFA_GRACE_KEY);
    if (raw === null) {
      setDaysRemaining(null);
      return;
    }
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      setDaysRemaining(parsed);
    }
    // Session-scoped dismissal — back on next tab open.
    if (sessionStorage.getItem('mfaGraceBannerDismissed') === '1') {
      setDismissed(true);
    }
  }, []);

  if (daysRemaining === null || dismissed) return null;

  // Defensive guard: negative numbers should be impossible (server
  // hard-blocks at expiry), but if a stale localStorage value somehow
  // goes negative, drop the banner rather than show "-2 days left".
  if (daysRemaining < 0) return null;

  const handleDismiss = () => {
    sessionStorage.setItem('mfaGraceBannerDismissed', '1');
    setDismissed(true);
  };

  // Copy varies by urgency:
  //   - 0 days: "Today is the last day"
  //   - 1 day:  "1 day left"
  //   - else:   "N days left"
  const countdown =
    daysRemaining === 0
      ? t('mfa.grace.lastDay')
      : daysRemaining === 1
        ? t('mfa.grace.oneDay')
        : t('mfa.grace.nDays').replace('{n}', String(daysRemaining));

  return (
    <div
      role="alert"
      className="relative flex items-start gap-3 px-4 py-3 mx-4 sm:mx-6 md:mx-8 lg:mx-10 2xl:mx-14 mt-4 rounded-lg text-[13px]"
      style={{
        backgroundColor: 'var(--status-warning-soft)',
        color: 'var(--status-warning-text)',
        border: '1px solid var(--status-warning)',
      }}
    >
      <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" strokeWidth={2.25} />
      <div className="flex-1 space-y-0.5">
        <p className="font-semibold">{t('mfa.grace.title')}</p>
        <p className="text-[12.5px] leading-relaxed opacity-90">
          {countdown}{' '}
          <Link
            href="/settings/profile"
            className="underline font-medium hover:opacity-80 transition-opacity"
          >
            {t('mfa.grace.cta')}
          </Link>
        </p>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label={t('mfa.grace.dismiss')}
        className="flex-shrink-0 p-1 -m-1 opacity-60 hover:opacity-100 transition-opacity"
      >
        <X className="w-4 h-4" strokeWidth={2.25} />
      </button>
    </div>
  );
}
