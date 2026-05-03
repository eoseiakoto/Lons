'use client';

import { useRouter } from 'next/navigation';
import { gql, useMutation } from '@apollo/client';
import { useToast } from '@/components/ui/toast';
import { useI18n } from '@/lib/i18n/i18n-context';
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
  const { t } = useI18n();
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
    <div className="relative space-y-6 animate-enter">
      <Link
        href="/platform/tenants"
        className="relative z-10 inline-flex items-center gap-1.5 text-[12px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        {t('common.back')}
      </Link>

      <header className="relative z-10">
        <div className="flex items-center gap-3 mb-3">
          <span className="live-dot" aria-hidden />
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[color:var(--accent-primary-deep)]">
            Tenant wizard
          </span>
        </div>
        <h1
          className="font-semibold tracking-[-0.035em] text-[color:var(--text-primary)]"
          style={{ fontSize: 44, lineHeight: 1.05 }}
        >
          Create tenant
        </h1>
        <p className="text-[15px] text-[color:var(--text-secondary)] mt-2 max-w-[60ch]">
          Set up a new organization on the platform — admin user, plan, and initial configuration.
        </p>
      </header>

      <div className="relative z-10 max-w-3xl">
        <TenantCreateWizard onSubmit={handleSubmit} submitting={loading} />
      </div>
    </div>
  );
}
