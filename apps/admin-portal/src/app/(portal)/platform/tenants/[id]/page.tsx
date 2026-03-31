'use client';

import { use } from 'react';
import { gql, useQuery, useMutation } from '@apollo/client';
import { useToast } from '@/components/ui/toast';
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
        <div className="text-white/40">Loading tenant...</div>
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className="space-y-4">
        <Link href="/platform/tenants" className="flex items-center gap-2 text-white/50 hover:text-white text-sm">
          <ArrowLeft className="w-4 h-4" />
          Back to Tenants
        </Link>
        <div className="glass p-8 text-center">
          <p className="text-red-400 text-sm">{error?.message || 'Tenant not found.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/platform/tenants" className="text-white/40 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">{tenant.name}</h1>
          <p className="text-sm text-white/40">{tenant.slug}</p>
        </div>
      </div>

      {/* Tenant detail tabs */}
      <div className="glass p-6">
        <TenantDetailTabs
          tenant={tenant}
          onSave={handleSave}
          onStatusChange={handleStatusChange}
          saving={saving}
        />
      </div>

      {/* SP management */}
      <div className="glass p-6">
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
