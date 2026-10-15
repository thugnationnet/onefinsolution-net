import type { MetadataRoute } from 'next';
import { company } from '@/lib/company';
const publicPages = [
  { path: '/', priority: 1 },
  { path: '/about', priority: 0.7 },
  { path: '/pricing', priority: 0.8 },
  { path: '/software', priority: 0.75 },
  { path: '/contact', priority: 0.6 },
  { path: '/support', priority: 0.6 },
  { path: '/privacy', priority: 0.3 },
  { path: '/terms', priority: 0.3 },
  { path: '/payment-policy', priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return publicPages.map(({ path, priority }) => ({
    url: new URL(path, company.website).toString(),
    changeFrequency: 'monthly',
    priority,
  }));
}
