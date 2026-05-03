/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Ensure monorepo packages are transpiled correctly during dev
  transpilePackages: ['@lons/common', '@lons/shared-types', '@lons/event-contracts'],
  // Lint separately via `pnpm lint` — don't block builds on warnings
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Disable full-page reload on unrecoverable errors — let our ChunkErrorRecovery handle it
  experimental: {
    clientRouterFilter: false,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      // In dev mode, make chunk loading more resilient
      config.output.crossOriginLoading = 'anonymous';
    }
    return config;
  },
};

export default nextConfig;
