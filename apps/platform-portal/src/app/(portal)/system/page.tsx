'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Server, CheckCircle2, XCircle, Activity } from 'lucide-react';
import { PageBackdrop } from '@/components/dashboard/page-backdrop';
import { PageHeader } from '@/components/ui/page-header';
import { MetricCard } from '@/components/ui/metric-card';

interface ServiceStatus {
  name: string;
  endpoint: string;
  healthy: boolean | null;
  loading: boolean;
  detail?: string;
  latencyMs?: number;
}

const GRAPHQL_URL = process.env.NEXT_PUBLIC_GRAPHQL_URL || 'http://localhost:3000/graphql';
const REST_URL = process.env.NEXT_PUBLIC_REST_URL || 'http://localhost:3001';
const SCORING_URL = process.env.NEXT_PUBLIC_SCORING_URL || 'http://localhost:8000';

const SERVICES = [
  {
    name: 'GraphQL Server',
    endpoint: GRAPHQL_URL,
    method: 'POST',
    body: '{"query":"{ __typename }"}',
  },
  { name: 'REST Server', endpoint: `${REST_URL}/health`, method: 'GET' },
  { name: 'Scoring Service', endpoint: `${SCORING_URL}/health`, method: 'GET' },
];

async function checkHealth(
  service: (typeof SERVICES)[0],
): Promise<{ healthy: boolean; detail?: string; latencyMs: number }> {
  const start = performance.now();
  try {
    const options: RequestInit = {
      method: service.method,
      signal: AbortSignal.timeout(5000),
      headers: { 'Content-Type': 'application/json' },
    };
    if (service.body) options.body = service.body;
    const response = await fetch(service.endpoint, options);
    const latencyMs = Math.round(performance.now() - start);
    if (response.ok) {
      const data = await response.json().catch(() => null);
      const detail = data?.status || data?.data?.__typename || 'OK';
      return { healthy: true, detail: String(detail), latencyMs };
    }
    return { healthy: false, detail: `HTTP ${response.status}`, latencyMs };
  } catch {
    const latencyMs = Math.round(performance.now() - start);
    return { healthy: false, detail: 'Connection refused', latencyMs };
  }
}

export default function SystemPage() {
  const [services, setServices] = useState<ServiceStatus[]>(
    SERVICES.map((s) => ({
      name: s.name,
      endpoint: s.endpoint,
      healthy: null,
      loading: true,
    })),
  );
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const checkAll = async () => {
    setServices(
      SERVICES.map((s) => ({
        name: s.name,
        endpoint: s.endpoint,
        healthy: null,
        loading: true,
      })),
    );
    const results = await Promise.all(
      SERVICES.map(async (service) => {
        const { healthy, detail, latencyMs } = await checkHealth(service);
        return {
          name: service.name,
          endpoint: service.endpoint,
          healthy,
          loading: false,
          detail,
          latencyMs,
        };
      }),
    );
    setServices(results);
    setLastChecked(new Date());
  };

  useEffect(() => {
    checkAll();
  }, []);

  const healthyCount = services.filter((s) => s.healthy).length;
  const downCount = services.filter((s) => s.healthy === false).length;
  const checking = services.some((s) => s.loading);
  const avgLatency =
    services.filter((s) => s.latencyMs).reduce((a, s) => a + (s.latencyMs ?? 0), 0) /
      Math.max(services.filter((s) => s.latencyMs).length, 1) || 0;

  const overallStatus = checking
    ? 'Checking…'
    : downCount === 0
      ? 'All systems operational'
      : `${downCount} service${downCount === 1 ? '' : 's'} down`;

  return (
    <div className="relative space-y-8 animate-enter">
      <PageBackdrop />

      <PageHeader
        eyebrow="Live · Infrastructure"
        title="System health"
        subtitle={`${overallStatus}${
          lastChecked ? ` · last check ${lastChecked.toLocaleTimeString()}` : ''
        }.`}
        actions={
          <button onClick={checkAll} disabled={checking} className="btn-secondary disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
            {checking ? 'Checking…' : 'Refresh'}
          </button>
        }
      />

      {/* KPI strip */}
      <section className="relative z-10 stagger-children grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          variant="glow"
          title="Services"
          value={services.length}
          subtitle="Monitored endpoints"
          icon={<Server className="w-4 h-4" />}
        />
        <MetricCard
          variant="glow"
          title="Healthy"
          value={healthyCount}
          subtitle={`${Math.round((healthyCount / services.length) * 100)}% up`}
          icon={<CheckCircle2 className="w-4 h-4" />}
          live={healthyCount > 0}
        />
        <MetricCard
          variant="glow"
          title="Down"
          value={downCount}
          subtitle={downCount > 0 ? 'Investigate now' : 'All clear'}
          icon={<XCircle className="w-4 h-4" />}
          live={downCount > 0}
        />
        <MetricCard
          variant="glow"
          title="Avg latency"
          value={`${Math.round(avgLatency)}ms`}
          subtitle="Across checks"
          icon={<Activity className="w-4 h-4" />}
        />
      </section>

      {/* Service cards */}
      <section className="relative z-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {services.map((service, i) => {
          const dotColor = service.loading
            ? 'var(--text-tertiary)'
            : service.healthy
              ? 'var(--status-success)'
              : 'var(--status-error)';
          return (
            <motion.div
              key={service.name}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, duration: 0.32, ease: [0.23, 1, 0.32, 1] }}
              className="card-glow card-glow-sweep p-5 flex flex-col gap-3"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-[color:var(--text-tertiary)] mb-1.5">
                    Service
                  </p>
                  <h4 className="text-[16px] font-semibold tracking-tight text-[color:var(--text-primary)]">
                    {service.name}
                  </h4>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{
                      backgroundColor: dotColor,
                      boxShadow: service.loading ? undefined : `0 0 10px ${dotColor}`,
                      animation: service.healthy
                        ? 'liveDot 1800ms ease-in-out infinite'
                        : undefined,
                    }}
                  />
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: dotColor }}
                  >
                    {service.loading
                      ? 'Checking'
                      : service.healthy
                        ? 'Healthy'
                        : 'Down'}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-[color:var(--text-tertiary)] font-mono break-all">
                {service.endpoint}
              </p>

              <div
                className="flex items-center justify-between pt-3"
                style={{ borderTop: '1px solid var(--border-subtle)' }}
              >
                <span
                  className="text-[12px]"
                  style={{
                    color: service.loading
                      ? 'var(--text-tertiary)'
                      : service.healthy
                        ? 'var(--status-success-text)'
                        : 'var(--status-error-text)',
                  }}
                >
                  {service.loading
                    ? 'Awaiting…'
                    : service.detail || (service.healthy ? 'OK' : 'Unreachable')}
                </span>
                {service.latencyMs != null && !service.loading && (
                  <span className="text-[11px] text-[color:var(--text-tertiary)] tabular-nums">
                    {service.latencyMs}ms
                  </span>
                )}
              </div>
            </motion.div>
          );
        })}
      </section>
    </div>
  );
}
