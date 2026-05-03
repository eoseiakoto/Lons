'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, gql } from '@apollo/client';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle,
  Send,
  X,
  Building2,
  CheckCircle2,
  ShieldAlert,
  ShieldCheck,
  Filter,
  Megaphone,
} from 'lucide-react';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { PageHeader } from '@/components/ui/page-header';
import { MetricCard } from '@/components/ui/metric-card';
import { FilterPill } from '@/components/ui/filter-pill';
import { SlideOver } from '@/components/ui/slide-over';

const PRODUCTS_QUERY = gql`
  query ComplianceWarnings {
    products {
      edges {
        node {
          id
          name
          tenantId
          coolingOffHours
          status
        }
      }
    }
  }
`;

const TENANTS_QUERY = gql`
  query AllTenants {
    tenants(pagination: { first: 100 }) {
      edges {
        node {
          id
          name
          slug
        }
      }
    }
  }
`;

const SEND_MESSAGE = gql`
  mutation SendMessage($input: SendMessageInput!) {
    sendMessage(input: $input) {
      id
      subject
    }
  }
`;

interface Product {
  id: string;
  name: string;
  tenantId: string;
  coolingOffHours: number | null;
  status: string;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
}

const STATUS_COLOR: Record<string, string> = {
  active: 'var(--status-success)',
  draft: 'var(--text-tertiary)',
  suspended: 'var(--status-error)',
  archived: 'var(--text-tertiary)',
};

export default function CompliancePage() {
  const { data: productsData, loading: productsLoading } = useQuery(PRODUCTS_QUERY);
  const { data: tenantsData, loading: tenantsLoading } = useQuery(TENANTS_QUERY);
  const [sendMessage, { loading: sending }] = useMutation(SEND_MESSAGE);

  const [selectedTenant, setSelectedTenant] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTarget, setComposeTarget] = useState<{
    tenantId: string;
    tenantName: string;
    products: string[];
  } | null>(null);
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composePriority, setComposePriority] = useState('high');
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loading = productsLoading || tenantsLoading;

  const tenants: Tenant[] = tenantsData?.tenants?.edges?.map((e: any) => e.node) || [];
  const tenantMap = useMemo(() => new Map(tenants.map((t) => [t.id, t])), [tenants]);

  const allProducts: Product[] = productsData?.products?.edges?.map((e: any) => e.node) || [];
  const violatingProducts = allProducts.filter(
    (p) => p.coolingOffHours === 0 || p.coolingOffHours === null,
  );

  const filteredProducts = violatingProducts.filter((p) => {
    if (selectedTenant && p.tenantId !== selectedTenant) return false;
    if (statusFilter && p.status !== statusFilter) return false;
    return true;
  });

  const tenantGroups = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of violatingProducts) {
      const group = map.get(p.tenantId) || [];
      group.push(p);
      map.set(p.tenantId, group);
    }
    return map;
  }, [violatingProducts]);

  const affectedTenants = Array.from(tenantGroups.entries()).map(([tenantId, products]) => ({
    tenantId,
    tenantName: tenantMap.get(tenantId)?.name || tenantId.slice(0, 8) + '…',
    productCount: products.length,
    products,
  }));

  const uniqueStatuses = [...new Set(violatingProducts.map((p) => p.status))];

  const compliancePct =
    allProducts.length > 0
      ? Math.round(((allProducts.length - violatingProducts.length) / allProducts.length) * 100)
      : 100;

  const buildTenantMessage = (tenantName: string, productNames: string[]) =>
    `Dear ${tenantName} team,\n\n` +
    `The following product(s) have been flagged for missing cooling-off period configuration:\n\n` +
    productNames.map((n) => `  - ${n}`).join('\n') +
    `\n\nCooling-off periods are mandatory in many jurisdictions. Products without a cooling-off period may violate consumer protection regulations.\n\n` +
    `Please configure an appropriate cooling-off period for the above product(s) at your earliest convenience.\n\n` +
    `Thank you,\nLons Platform Compliance`;

  const openComposeForTenant = (tenantId: string, tenantName: string, products: Product[]) => {
    const productNames = products.map((p) => p.name);
    setComposeTarget({ tenantId, tenantName, products: productNames });
    setComposeSubject(`Compliance Action Required: Cooling-Off Period`);
    setComposeBody(buildTenantMessage(tenantName, productNames));
    setComposePriority('high');
    setComposeOpen(true);
  };

  const openComposeForAll = () => {
    setComposeTarget(null);
    setComposeSubject(`Compliance Action Required: Cooling-Off Period`);
    setComposeBody(
      `Each tenant will receive a personalised message listing only their flagged products.\n\n` +
        `--- Preview of individual messages ---\n\n` +
        affectedTenants
          .map((t) => {
            const names = t.products.map((p) => p.name);
            return `To: ${t.tenantName}\n` + names.map((n) => `  - ${n}`).join('\n');
          })
          .join('\n\n') +
        `\n\n--- End of preview ---\n\n` +
        `Cooling-off periods are mandatory in many jurisdictions. Products without a cooling-off period may violate consumer protection regulations.\n\n` +
        `Please configure an appropriate cooling-off period for the above product(s) at your earliest convenience.\n\n` +
        `Thank you,\nLons Platform Compliance`,
    );
    setComposePriority('high');
    setComposeOpen(true);
  };

  const handleSend = async () => {
    if (
      !composeSubject.trim() ||
      (!composeTarget && affectedTenants.length === 0) ||
      (composeTarget && !composeBody.trim())
    ) {
      setStatusMsg({ type: 'error', text: 'Subject and body are required.' });
      setTimeout(() => setStatusMsg(null), 3000);
      return;
    }
    try {
      if (composeTarget) {
        await sendMessage({
          variables: {
            input: {
              type: 'direct',
              priority: composePriority,
              subject: composeSubject,
              body: composeBody,
              tenantId: composeTarget.tenantId,
            },
          },
        });
      } else {
        const results = await Promise.allSettled(
          affectedTenants.map((t) =>
            sendMessage({
              variables: {
                input: {
                  type: 'direct',
                  priority: composePriority,
                  subject: composeSubject,
                  body: buildTenantMessage(
                    t.tenantName,
                    t.products.map((p) => p.name),
                  ),
                  tenantId: t.tenantId,
                },
              },
            }),
          ),
        );
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed > 0) {
          setStatusMsg({
            type: 'error',
            text: `Sent to ${results.length - failed} tenant(s), but ${failed} failed.`,
          });
          setTimeout(() => setStatusMsg(null), 5000);
          setComposeOpen(false);
          setComposeSubject('');
          setComposeBody('');
          setComposeTarget(null);
          return;
        }
      }
      setStatusMsg({
        type: 'success',
        text: `Compliance notice sent${
          composeTarget ? ` to ${composeTarget.tenantName}` : ` to ${affectedTenants.length} tenant(s)`
        }.`,
      });
      setComposeOpen(false);
      setComposeSubject('');
      setComposeBody('');
      setComposeTarget(null);
      setTimeout(() => setStatusMsg(null), 4000);
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: `Failed to send: ${err.message}` });
      setTimeout(() => setStatusMsg(null), 5000);
    }
  };

  const filtersActive = Boolean(selectedTenant || statusFilter);

  return (
    <div className="relative space-y-8 animate-enter">
      <PageBackdrop />

      <PageHeader
        eyebrow="Live · Compliance signals"
        title="Compliance"
        subtitle={
          loading
            ? 'Loading…'
            : `${violatingProducts.length} product${violatingProducts.length === 1 ? '' : 's'} flagged across ${tenantGroups.size} tenant${tenantGroups.size === 1 ? '' : 's'}.`
        }
        actions={
          !loading && affectedTenants.length > 0 ? (
            <button onClick={openComposeForAll} className="btn-primary">
              <Megaphone className="w-4 h-4" />
              Notify all
            </button>
          ) : undefined
        }
      />

      {/* KPI strip */}
      <section className="relative z-10 stagger-children grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          variant="glow"
          title="Total products"
          value={loading ? '—' : allProducts.length}
          subtitle="Across all tenants"
          icon={<ShieldCheck className="w-4 h-4" />}
        />
        <MetricCard
          variant="glow"
          title="Flagged"
          value={loading ? '—' : violatingProducts.length}
          subtitle="No cooling-off"
          icon={<ShieldAlert className="w-4 h-4" />}
          live={violatingProducts.length > 0}
        />
        <MetricCard
          variant="glow"
          title="Affected tenants"
          value={loading ? '—' : tenantGroups.size}
          subtitle={`${affectedTenants.slice(0, 3).map((t) => t.tenantName.split(' ')[0]).join(' · ') || '—'}`}
          icon={<Building2 className="w-4 h-4" />}
        />
        <MetricCard
          variant="glow"
          title="Compliance"
          value={loading ? '—' : `${compliancePct}%`}
          subtitle="Products configured"
          icon={<CheckCircle2 className="w-4 h-4" />}
        />
      </section>

      {/* Status toast */}
      <AnimatePresence>
        {statusMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="relative z-10 card-glow px-4 py-2.5 text-sm flex items-center gap-2"
            style={{
              color:
                statusMsg.type === 'success'
                  ? 'var(--status-success-text)'
                  : 'var(--status-error-text)',
            }}
          >
            {statusMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <X className="w-4 h-4" />
            )}
            {statusMsg.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Warning banner */}
      {!loading && violatingProducts.length > 0 && (
        <div
          className="relative z-10 rounded-xl p-5 flex items-start gap-4"
          style={{
            backgroundColor: 'var(--status-warning-soft)',
            border: '1px solid var(--status-warning)',
          }}
        >
          <span
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{
              backgroundColor: 'var(--status-warning-soft)',
              color: 'var(--status-warning-text)',
            }}
          >
            <AlertTriangle className="w-5 h-5" />
          </span>
          <div>
            <p className="text-[14px] font-semibold text-[color:var(--status-warning-text)]">
              {violatingProducts.length} product{violatingProducts.length === 1 ? '' : 's'} across{' '}
              {tenantGroups.size} tenant{tenantGroups.size === 1 ? '' : 's'} have no cooling-off
              period configured.
            </p>
            <p className="text-[13px] text-[color:var(--text-secondary)] mt-1">
              Cooling-off is mandatory in many jurisdictions. Products without a cooling-off
              period may violate consumer protection regulations.
            </p>
          </div>
        </div>
      )}

      {/* Affected tenants summary */}
      {!loading && affectedTenants.length > 0 && (
        <section className="relative z-10">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)]">
              Affected tenants
            </h2>
            <span className="text-[12px] text-[color:var(--text-tertiary)] tabular-nums">
              {affectedTenants.length} flagged
            </span>
          </div>
          <div className="stagger-children grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {affectedTenants.map((t) => (
              <div
                key={t.tenantId}
                className="card-glow p-5 flex items-center justify-between group hover:-translate-y-0.5 transition-transform"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-[12px] font-semibold flex-shrink-0"
                    style={{
                      backgroundColor: 'var(--status-warning-soft)',
                      color: 'var(--status-warning-text)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {t.tenantName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium text-[color:var(--text-primary)] truncate">
                      {t.tenantName}
                    </p>
                    <p className="text-[11px] text-[color:var(--text-tertiary)]">
                      {t.productCount} flagged · cooling-off
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => openComposeForTenant(t.tenantId, t.tenantName, t.products)}
                  className="text-[color:var(--accent-primary-deep)] hover:text-[color:var(--accent-primary-hover)] transition-all p-2 rounded-md hover:bg-[color:var(--bg-hover)] opacity-60 group-hover:opacity-100"
                  title={`Send compliance notice to ${t.tenantName}`}
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Filters */}
      {!loading && violatingProducts.length > 0 && (
        <section className="relative z-10 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 text-[12px] text-[color:var(--text-tertiary)]">
            <Filter className="w-3.5 h-3.5" />
            <span className="uppercase tracking-wider">Filter</span>
          </div>
          <FilterPill
            options={[
              { value: '', label: 'All tenants' },
              ...affectedTenants.map((t) => ({
                value: t.tenantId,
                label: `${t.tenantName} (${t.productCount})`,
              })),
            ]}
            value={selectedTenant}
            onChange={setSelectedTenant}
          />
          <FilterPill
            options={[
              { value: '', label: 'All statuses' },
              ...uniqueStatuses.map((s) => ({ value: s, label: s.replace(/_/g, ' ') })),
            ]}
            value={statusFilter}
            onChange={setStatusFilter}
          />
          {filtersActive && (
            <button
              onClick={() => {
                setSelectedTenant('');
                setStatusFilter('');
              }}
              className="text-[12px] text-[color:var(--text-tertiary)] hover:text-[color:var(--text-primary)] underline-offset-2 hover:underline ml-1"
            >
              Clear
            </button>
          )}
          <span className="ml-auto text-[12px] text-[color:var(--text-tertiary)] tabular-nums">
            {filteredProducts.length} flagged
          </span>
        </section>
      )}

      {/* Products table */}
      <section className="relative z-10 card-glow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--border-subtle)]">
                <Th>Product</Th>
                <Th>Tenant</Th>
                <Th>Cooling-off</Th>
                <Th>Status</Th>
                <Th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-[color:var(--text-tertiary)]">
                    Loading products…
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center">
                    <ShieldCheck className="w-8 h-8 mx-auto text-[color:var(--accent-primary-deep)] mb-3" />
                    <p className="text-sm text-[color:var(--text-primary)] font-medium">
                      All clear.
                    </p>
                    <p className="text-[12px] text-[color:var(--text-tertiary)] mt-1">
                      Every product matching these filters has a cooling-off period.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p, i) => {
                  const tenant = tenantMap.get(p.tenantId);
                  const tenantProducts = tenantGroups.get(p.tenantId) || [];
                  const statusColor = STATUS_COLOR[p.status] ?? 'var(--text-tertiary)';
                  return (
                    <tr
                      key={p.id}
                      className="table-row-enter border-b border-[color:var(--border-subtle)] last:border-b-0 hover:bg-[color:var(--bg-hover)] transition-colors"
                      style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                    >
                      <Td>
                        <span className="text-[color:var(--text-primary)] font-medium">{p.name}</span>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-[color:var(--text-tertiary)] flex-shrink-0" />
                          <div>
                            <span className="text-[color:var(--text-primary)]">
                              {tenant?.name || 'Unknown'}
                            </span>
                            <span className="block text-[10px] font-mono text-[color:var(--text-tertiary)]">
                              {p.tenantId.slice(0, 8)}
                            </span>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[color:var(--status-error-text)] tabular-nums">
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{
                              backgroundColor: 'var(--status-error)',
                              boxShadow: '0 0 6px var(--status-error)',
                            }}
                          />
                          {p.coolingOffHours ?? 0}h
                        </span>
                      </Td>
                      <Td>
                        <span
                          className="inline-flex items-center gap-1.5 text-[12px] capitalize"
                          style={{ color: statusColor }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{
                              backgroundColor: statusColor,
                              boxShadow: `0 0 6px ${statusColor}`,
                            }}
                          />
                          {p.status?.replace(/_/g, ' ') || '—'}
                        </span>
                      </Td>
                      <Td>
                        <button
                          onClick={() => {
                            openComposeForTenant(
                              p.tenantId,
                              tenant?.name || 'Unknown',
                              tenantProducts,
                            );
                          }}
                          className="text-[color:var(--accent-primary-deep)] hover:text-[color:var(--accent-primary-hover)] transition-colors p-1 rounded hover:bg-[color:var(--bg-hover)]"
                          title={`Send compliance notice to ${tenant?.name || 'tenant'}`}
                        >
                          <Send className="w-4 h-4" />
                        </button>
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Compose slide-over */}
      <AnimatePresence>
        {composeOpen && (
          <SlideOver
            title="Compliance notice"
            subtitle={
              composeTarget ? `To · ${composeTarget.tenantName}` : 'To · all affected tenants'
            }
            onClose={() => setComposeOpen(false)}
            footer={
              <>
                <button
                  onClick={handleSend}
                  disabled={sending}
                  className="btn-primary disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  {sending
                    ? 'Sending…'
                    : composeTarget
                      ? 'Send to tenant'
                      : `Send to ${affectedTenants.length}`}
                </button>
                <button onClick={() => setComposeOpen(false)} className="btn-ghost">
                  Cancel
                </button>
              </>
            }
          >
            <div className="space-y-4">
              {composeTarget && (
                <div
                  className="rounded-lg p-4 flex items-center gap-3"
                  style={{
                    backgroundColor: 'var(--bg-muted)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-[12px] font-semibold flex-shrink-0"
                    style={{
                      backgroundColor: 'var(--accent-primary-soft)',
                      color: 'var(--accent-primary-deep)',
                    }}
                  >
                    {composeTarget.tenantName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[color:var(--text-primary)]">
                      {composeTarget.tenantName}
                    </p>
                    <p className="text-[11px] text-[color:var(--text-tertiary)] truncate">
                      Flagged: {composeTarget.products.join(', ')}
                    </p>
                  </div>
                </div>
              )}

              <FieldGroup label="Priority">
                <select
                  className="input-field"
                  value={composePriority}
                  onChange={(e) => setComposePriority(e.target.value)}
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </FieldGroup>

              <FieldGroup label="Subject">
                <input
                  type="text"
                  className="input-field"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                />
              </FieldGroup>

              <FieldGroup label="Message">
                <textarea
                  className="input-field min-h-[280px] resize-y"
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                />
              </FieldGroup>
            </div>
          </SlideOver>
        )}
      </AnimatePresence>
    </div>
  );
}

function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[color:var(--text-tertiary)] ${className ?? ''}`}
    >
      {children}
    </th>
  );
}
function Td({ children }: { children?: React.ReactNode }) {
  return <td className="px-4 py-3.5">{children}</td>;
}
function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] uppercase tracking-wider text-[color:var(--text-tertiary)]">
        {label}
      </label>
      {children}
    </div>
  );
}
