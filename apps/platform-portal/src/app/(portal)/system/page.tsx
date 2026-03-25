'use client';

import { useEffect, useState } from 'react';

interface ServiceStatus {
  name: string;
  endpoint: string;
  healthy: boolean | null;
  loading: boolean;
  detail?: string;
}

const SERVICES = [
  { name: 'GraphQL Server', endpoint: 'http://localhost:3000/graphql', method: 'POST', body: '{"query":"{ __typename }"}' },
  { name: 'REST Server', endpoint: 'http://localhost:3001/v1/health', method: 'GET' },
  { name: 'Scoring Service', endpoint: 'http://localhost:8000/health', method: 'GET' },
];

async function checkHealth(service: typeof SERVICES[0]): Promise<{ healthy: boolean; detail?: string }> {
  try {
    const options: RequestInit = {
      method: service.method,
      signal: AbortSignal.timeout(5000),
      headers: { 'Content-Type': 'application/json' },
    };
    if (service.body) options.body = service.body;

    const response = await fetch(service.endpoint, options);
    if (response.ok) {
      const data = await response.json().catch(() => null);
      const detail = data?.status || data?.data?.__typename || 'OK';
      return { healthy: true, detail: String(detail) };
    }
    return { healthy: false, detail: `HTTP ${response.status}` };
  } catch {
    return { healthy: false, detail: 'Connection refused' };
  }
}

export default function SystemPage() {
  const [services, setServices] = useState<ServiceStatus[]>(
    SERVICES.map((s) => ({ name: s.name, endpoint: s.endpoint, healthy: null, loading: true })),
  );

  const checkAll = async () => {
    setServices(SERVICES.map((s) => ({ name: s.name, endpoint: s.endpoint, healthy: null, loading: true })));
    const results = await Promise.all(
      SERVICES.map(async (service) => {
        const { healthy, detail } = await checkHealth(service);
        return { name: service.name, endpoint: service.endpoint, healthy, loading: false, detail };
      }),
    );
    setServices(results);
  };

  useEffect(() => { checkAll(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">System Health</h3>
          <p className="text-sm text-white/40">Monitor service status across the platform</p>
        </div>
        <button onClick={checkAll} className="glass-button text-sm">
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {services.map((service) => (
          <div key={service.name} className="glass p-6">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-white">{service.name}</h4>
              <div className="flex items-center gap-2">
                {service.loading ? (
                  <div className="w-3 h-3 rounded-full bg-white/20 animate-pulse" />
                ) : service.healthy ? (
                  <div className="w-3 h-3 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/30" />
                ) : (
                  <div className="w-3 h-3 rounded-full bg-red-400 shadow-lg shadow-red-400/30" />
                )}
              </div>
            </div>
            <p className="text-xs text-white/30 font-mono break-all">{service.endpoint}</p>
            <p className="text-xs mt-2">
              {service.loading ? (
                <span className="text-white/30">Checking...</span>
              ) : service.healthy ? (
                <span className="text-emerald-400">{service.detail || 'Service healthy'}</span>
              ) : (
                <span className="text-red-400">{service.detail || 'Service unreachable'}</span>
              )}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
