import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '6mb',
    },
  },
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      stripe: path.resolve(process.cwd(), 'node_modules/stripe'),
    };
    return config;
  },
};

export default nextConfig;
