/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  eslint: {
    ignoreDuringBuilds: true,
  },
  transpilePackages: ['@lons/common', '@lons/shared-types', '@lons/event-contracts'],
  experimental: {
    clientRouterFilter: false,
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.output.crossOriginLoading = 'anonymous';
    }
    return config;
  },
};

export default nextConfig;
