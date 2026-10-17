import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(self)',
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains; preload',
  },
  // Baseline CSP — Stripe.js + Checkout + Elements require stripe domains.
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "img-src 'self' data: blob: https://*.stripe.com https://*.stripe.network",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://*.js.stripe.com",
      "connect-src 'self' https://api.stripe.com https://*.stripe.com https://*.stripe.network wss: https:",
      "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com https://billing.stripe.com https://*.stripe.com",
      "worker-src 'self' blob:",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: '6mb',
    },
  },
  // Avoid absolute webpack aliases into node_modules (can create phantom App Router paths).
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
