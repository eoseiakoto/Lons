'use client';

import { useQuery, gql } from '@apollo/client';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { StatusBadge } from '@/components/ui/status-badge';
import { formatDate } from '@/lib/utils';
import { ArrowLeft, Package, Users, FileText } from 'lucide-react';

const TENANT_QUERY = gql`
  query Tenant($id: ID!) {
    tenant(id: $id) {
      id
      name
      slug
      country
      status
      planTier
      createdAt
      updatedAt
    }
  }
`;

export default function TenantDetailPage() {
  const params = useParams();
  const tenantId = params.id as string;
  const { data, loading } = useQuery(TENANT_QUERY, { variables: { id: tenantId } });

  const tenant = data?.tenant;

  if (loading) {
    return (
      <div className="text-center py-8 text-white/40">Loading tenant...</div>
    );
  }

  if (!tenant) {
    return (
      <div className="text-center py-8 text-white/40">Tenant not found</div>
    );
  }

  const drilldownLinks = [
    { name: 'Products', href: `/tenants/${tenantId}/products`, icon: Package, description: 'View loan products configured for this tenant' },
    { name: 'Customers', href: `/tenants/${tenantId}/customers`, icon: Users, description: 'View customers registered under this tenant' },
    { name: 'Contracts', href: `/tenants/${tenantId}/contracts`, icon: FileText, description: 'View active and historical loan contracts' },
  ];

  return (
    <div className="space-y-6">
      <Link href="/tenants" className="inline-flex items-center text-sm text-white/40 hover:text-white transition-colors">
        <ArrowLeft className="w-4 h-4 mr-1" />
        Back to Tenants
      </Link>

      <div className="glass p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">{tenant.name}</h2>
            <p className="text-sm text-white/40 font-mono mt-1">{tenant.slug}</p>
          </div>
          <StatusBadge status={tenant.status} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-6">
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wider">Country</p>
            <p className="text-sm text-white mt-1">{tenant.country}</p>
          </div>
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wider">Plan Tier</p>
            <p className="text-sm text-white mt-1 capitalize">{tenant.planTier?.replace(/_/g, ' ') || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wider">Created</p>
            <p className="text-sm text-white mt-1">{formatDate(tenant.createdAt)}</p>
          </div>
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wider">Last Updated</p>
            <p className="text-sm text-white mt-1">{formatDate(tenant.updatedAt)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {drilldownLinks.map((link) => (
          <Link key={link.name} href={link.href}>
            <div className="glass p-6 hover:bg-white/10 transition-all duration-200 cursor-pointer h-full">
              <div className="flex items-center gap-3 mb-2">
                <link.icon className="w-5 h-5 text-blue-400" />
                <h3 className="text-sm font-semibold text-white">{link.name}</h3>
              </div>
              <p className="text-xs text-white/40">{link.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
