'use client';

import Link from 'next/link';
import {
  UserCircle,
  Users,
  ScrollText,
  Globe,
  Key,
  ShieldCheck,
  ArrowUpRight,
} from 'lucide-react';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { PageHeader } from '@/components/ui/page-header';

const settingsLinks = [
  {
    name: 'My profile',
    description: 'Name, email, password, and personal preferences.',
    href: '/settings/profile',
    icon: UserCircle,
    eyebrow: 'Account',
  },
  {
    name: 'Users',
    description: 'Platform administrator and support user accounts.',
    href: '/settings/users',
    icon: Users,
    eyebrow: 'Access',
  },
  {
    name: 'Audit log',
    description: 'Cross-tenant audit trail of platform-wide actions.',
    href: '/settings/audit-log',
    icon: ScrollText,
    eyebrow: 'Compliance',
  },
  {
    name: 'Platform defaults',
    description: 'Default tenant settings, exposure limits, and policies.',
    href: '/settings/defaults',
    icon: ShieldCheck,
    eyebrow: 'Configuration',
  },
  {
    name: 'API keys',
    description: 'Service-to-service authentication credentials.',
    href: '/settings/api-keys',
    icon: Key,
    eyebrow: 'Integration',
  },
  {
    name: 'Platform info',
    description: 'Version, endpoints, and infrastructure details.',
    href: '/settings/platform',
    icon: Globe,
    eyebrow: 'About',
  },
];

export default function SettingsPage() {
  return (
    <div className="relative space-y-8 animate-enter">
      <PageBackdrop />

      <PageHeader
        eyebrow="Configuration · Platform"
        title="Settings"
        subtitle="How the platform itself runs."
      />

      <section className="relative z-10 stagger-children grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {settingsLinks.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block h-full"
          >
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
