'use client';

import Link from 'next/link';
import { Users, FileText } from 'lucide-react';

const settingsLinks = [
  { name: 'User Management', description: 'Manage operator accounts and roles', href: '/settings/users', icon: Users },
  { name: 'Audit Log', description: 'View immutable system activity log', href: '/settings/audit-log', icon: FileText },
];

export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-lg font-semibold text-white/80 mb-6">Settings</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {settingsLinks.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            className="glass p-6 hover:bg-white/10 transition-all duration-200 group"
          >
            <item.icon className="w-8 h-8 text-blue-400 mb-3" />
            <h3 className="font-semibold text-white">{item.name}</h3>
            <p className="text-sm text-white/40 mt-1">{item.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
