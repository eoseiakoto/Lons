'use client';

import { useRouter } from 'next/navigation';
import { gql, useMutation } from '@apollo/client';
import { useToast } from '@/components/ui/toast';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import {
  TenantCreateWizard,
  type TenantCreateForm,
} from '@/components/platform/tenant-create-wizard';

const CREATE_TENANT = gql`
  mutation CreateTenant($input: CreateTenantInput!, $idempotencyKey: String) {
    createTenant(input: $input, idempotencyKey: $idempotencyKey) {
      id
      name
      slug
      status
    }
  }
`;

export default function CreateTenantPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [createTenant, { loading }] = useMutation(CREATE_TENANT);

  const handleSubmit = async (form: TenantCreateForm) => {
    try {
      let settings: Record<string, any> | undefined;
      try {
        const parsed = JSON.parse(form.settings);
        if (typeof parsed === 'object') settings = parsed;
      } catch {
        // ignore invalid JSON, send undefined
      }

      const { data } = await createTenant({
        variables: {
          input: {
            name: form.name,
            slug: form.slug,
            legalName: form.legalName || undefined,
            registrationNumber: form.registrationNumber || undefined,
            country: form.country,
            planTier: form.planTier,
            adminEmail: form.adminEmail,
            adminName: form.adminName,
            adminPassword: form.adminPassword,
            settings,
          },
          idempotencyKey: `create-tenant-${form.slug}-${Date.now()}`,
        },
      });

      toast('success', `Tenant "${form.name}" created successfully`);

      if (data?.createTenant?.id) {
        router.push(`/platform/tenants/${data.createTenant.id}`);
      } else {
        router.push('/platform/tenants');
      }
    } catch (err: any) {
      toast('error', err.message || 'Failed to create tenant');
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/platform/tenants" className="text-white/40 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">Create Tenant</h1>
          <p className="text-sm text-white/40 mt-1">
            Set up a new organization on the platform
          </p>
        </div>
      </div>

      <TenantCreateWizard onSubmit={handleSubmit} submitting={loading} />
    </div>
  );
}
