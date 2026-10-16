import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '6mb',
    },
  },
  // Avoid absolute webpack aliases into node_modules (can create phantom App Router paths).
};

export default nextConfig;
