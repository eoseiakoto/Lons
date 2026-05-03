'use client';

import { use } from 'react';
import { gql, useQuery, useMutation } from '@apollo/client';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/lib/i18n/i18n-context';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { TenantDetailTabs, type TenantDetail } from '@/components/platform/tenant-detail-tabs';
import { SpManagement, type ServiceProviderRow } from '@/components/platform/sp-management';

const GET_TENANT = gql`
  query GetTenant($id: ID!) {
    tenant(id: $id) {
      id
      name
      slug
      legalName
      registrationNumber
      country
      schemaName
      planTier
      status
      settings
      createdAt
      updatedAt
      serviceProviders {
        id
        name
        code
        status
        productCount
      }
    }
  }
`;

const UPDATE_TENANT = gql`
  mutation UpdateTenant($id: ID!, $input: UpdateTenantInput!, $idempotencyKey: String) {
    updateTenant(id: $id, input: $input, idempotencyKey: $idempotencyKey) {
      id
      name
      slug
      status
      updatedAt
    }
  }
`;

const CHANGE_TENANT_STATUS = gql`
  mutation ChangeTenantStatus($id: ID!, $status: String!, $reason: String, $idempotencyKey: String) {
    changeTenantStatus(id: $id, status: $status, reason: $reason, idempotencyKey: $idempotencyKey) {
      id
      status
      updatedAt
    }
  }
`;

const CREATE_SP = gql`
  mutation CreateServiceProvider($tenantId: ID!, $input: CreateServiceProviderInput!, $idempotencyKey: String) {
    createServiceProvider(tenantId: $tenantId, input: $input, idempotencyKey: $idempotencyKey) {
      id
      name
      code
      status
    }
  }
`;

const UPDATE_SP = gql`
  mutation UpdateServiceProvider($id: ID!, $input: UpdateServiceProviderInput!, $idempotencyKey: String) {
    updateServiceProvider(id: $id, input: $input, idempotencyKey: $idempotencyKey) {
      id
      name
      code
    }
  }
`;

export default function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useI18n();
  const { toast } = useToast();

  const { data, loading, error, refetch } = useQuery(GET_TENANT, {
    variables: { id },
    fetchPolicy: 'cache-and-network',
  });

  const [updateTenant, { loading: saving }] = useMutation(UPDATE_TENANT);
  const [changeTenantStatus] = useMutation(CHANGE_TENANT_STATUS);
  const [createSp] = useMutation(CREATE_SP);
  const [updateSp] = useMutation(UPDATE_SP);

  const tenant: TenantDetail | null = data?.tenant ?? null;
  const serviceProviders: ServiceProviderRow[] = data?.tenant?.serviceProviders ?? [];

  const handleSave = async (updates: Partial<TenantDetail>) => {
    try {
      await updateTenant({
        variables: {
          id,
          input: updates,
          idempotencyKey: `update-tenant-${id}-${Date.now()}`,
        },
      });
      toast('success', 'Tenant updated successfully');
      refetch();
    } catch (err: any) {
      toast('error', err.message || 'Failed to update tenant');
    }
  };

  const handleStatusChange = async (newStatus: string, reason?: string) => {
    try {
      await changeTenantStatus({
        variables: {
          id,
          status: newStatus,
          reason,
          idempotencyKey: `status-${id}-${newStatus}-${Date.now()}`,
        },
      });
      toast('success', `Tenant status changed to ${newStatus}`);
      refetch();
    } catch (err: any) {
      toast('error', err.message || 'Failed to change tenant status');
    }
  };

  const handleCreateSp = async (data: { name: string; code: string }) => {
    try {
      await createSp({
        variables: {
          tenantId: id,
          input: data,
          idempotencyKey: `create-sp-${id}-${data.code}-${Date.now()}`,
        },
      });
      toast('success', 'Service provider created');
      refetch();
    } catch (err: any) {
      toast('error', err.message || 'Failed to create service provider');
    }
  };

  const handleUpdateSp = async (spId: string, data: { name: string; code: string }) => {
    try {
      await updateSp({
        variables: {
          id: spId,
          input: data,
          idempotencyKey: `update-sp-${spId}-${Date.now()}`,
        },
      });
      toast('success', 'Service provider updated');
      refetch();
    } catch (err: any) {
      toast('error', err.message || 'Failed to update service provider');
    }
  };

  if (loading && !tenant) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="text-[color:var(--text-secondary)]">Loading tenant...</div>
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className="space-y-4 animate-enter">
        <Link href="/platform/tenants" className="inline-flex items-center gap-1.5 text-[12px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          {t('common.back')}
        </Link>
        <div className="card-glow p-12 text-center">
          <p className="text-[color:var(--status-error-text)] text-sm">{error?.message || 'Tenant not found.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative space-y-8 animate-enter">
      <Link
        href="/platform/tenants"
        className="relative z-10 inline-flex items-center gap-1.5 text-[12px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        {t('common.back')}
      </Link>

      <section className="relative z-10 card-glow-hero card-glow-sweep p-7 lg:p-8">
        <div className="flex items-start gap-5">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center text-[18px] font-semibold flex-shrink-0"
            style={{
              backgroundColor: 'var(--accent-primary-soft)',
              color: 'var(--accent-primary-deep)',
              border: '1px solid var(--border-default)',
            }}
          >
            {tenant.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="live-dot" aria-hidden />
              <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--accent-primary-deep)]">
                Platform tenant
              </span>
            </div>
            <h1
              className="font-semibold tracking-[-0.035em] text-[color:var(--text-primary)]"
              style={{ fontSize: 32, lineHeight: 1.05 }}
            >
              {tenant.name}
            </h1>
            <p className="text-[12px] font-mono text-[color:var(--text-tertiary)] mt-1">
              {tenant.slug}
            </p>
          </div>
        </div>
      </section>

      <div className="relative z-10 card-glow p-6">
        <TenantDetailTabs
          tenant={tenant}
          onSave={handleSave}
          onStatusChange={handleStatusChange}
          saving={saving}
        />
      </div>

      <div className="relative z-10 card-glow p-6">
        <SpManagement
          tenantId={id}
          serviceProviders={serviceProviders}
          onCreateSp={handleCreateSp}
          onUpdateSp={handleUpdateSp}
        />
      </div>
    </div>
  );
}
