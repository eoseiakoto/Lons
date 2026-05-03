'use client';

import Link from 'next/link';
import {
  Users,
  FileText,
  UserCircle,
  ArrowUpRight,
  Building2,
  Plug,
  Banknote,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/i18n-context';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { PageHeader } from '@/components/ui/page-header';

export default function SettingsPage() {
  const { t } = useI18n();

  const settingsLinks = [
    {
      name: t('settings.profileCard.title'),
      description: t('settings.profileCard.description'),
      href: '/settings/profile',
      icon: UserCircle,
      eyebrow: t('settings.overview.eyebrow.account'),
    },
    {
      name: t('settings.usersCard.title'),
      description: t('settings.usersCard.description'),
      href: '/settings/users',
      icon: Users,
      eyebrow: t('settings.overview.eyebrow.access'),
    },
    {
      name: t('settings.auditCard.title'),
      description: t('settings.auditCard.description'),
      href: '/settings/audit-log',
      icon: FileText,
      eyebrow: t('settings.overview.eyebrow.compliance'),
    },
    {
      name: t('settings.overview.tenantCard.title'),
      description: t('settings.overview.tenantCard.description'),
      href: '/settings/tenant',
      icon: Building2,
      eyebrow: t('settings.overview.eyebrow.configuration'),
    },
    {
      name: t('settings.overview.integrationsCard.title'),
      description: t('settings.overview.integrationsCard.description'),
      href: '/settings/integrations',
      icon: Plug,
      eyebrow: t('settings.overview.eyebrow.integration'),
    },
    {
      name: t('settings.overview.lendersCard.title'),
      description: t('settings.overview.lendersCard.description'),
      href: '/settings/lenders',
      icon: Banknote,
      eyebrow: t('settings.overview.eyebrow.capital'),
    },
  ];

  return (
    <div className="relative space-y-8 animate-enter">
      <PageBackdrop />

      <PageHeader
        eyebrow={t('eyebrow.configTenant')}
        title={t('settings.title')}
        subtitle={t('settings.overview.subtitle')}
      />

      <section className="relative z-10 stagger-children grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {settingsLinks.map((item) => (
          <Link key={item.href} href={item.href} className="block h-full">
            <div className="card-glow p-6 group h-full transition-transform hover:-translate-y-0.5">
              <div className="flex items-start justify-between mb-4">
                <span
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{
                    backgroundColor: 'var(--accent-primary-soft)',
                    color: 'var(--accent-primary-deep)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <item.icon className="w-4 h-4" />
                </span>
                <ArrowUpRight className="w-4 h-4 text-[color:var(--text-tertiary)] group-hover:text-[color:var(--accent-primary-deep)] transition-colors" />
              </div>
              <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[color:var(--accent-primary-deep)] mb-1">
                {item.eyebrow}
              </p>
              <h3 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)] mb-1.5">
                {item.name}
              </h3>
              <p className="text-[13px] text-[color:var(--text-tertiary)] leading-relaxed">
                {item.description}
              </p>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
