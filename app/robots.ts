import type { MetadataRoute } from 'next';
import { company } from '@/lib/company';
export default function robots():MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/account',
        '/dashboard',
        '/chat',
        '/c/',
        '/context',
        '/api/',
        '/auth/',
      ],
    },
    sitemap: `${company.website}/sitemap.xml`,
  };
}
