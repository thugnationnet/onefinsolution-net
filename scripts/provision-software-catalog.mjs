#!/usr/bin/env node
/**
 * Provision Stripe Products + one-time THB Prices for the software storefront (test or --live).
 * Idempotent via price lookup_keys. Does not change PaymentIntent amount logic.
 *
 * Usage: npm run stripe:provision-software
 * Env: STRIPE_SECRET_KEY (sk_test_… or sk_live_… with --live), optional STRIPE_EXPECTED_ACCOUNT_ID
 * Flags: --live (use live secret; write *.live artifacts)
 *
 * Writes:
 *   .stripe-software-ids.json
 *   .env.stripe-software-generated  (STRIPE_SOFTWARE_CATALOG=…)
 * Never prints secret keys.
 */

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import nextEnv from '@next/env';
import Stripe from 'stripe';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const SECRET = process.env.STRIPE_SECRET_KEY || '';
const EXPECTED_ACCOUNT = process.env.STRIPE_EXPECTED_ACCOUNT_ID || '';
const LIVE = process.argv.includes('--live');

if (!SECRET) {
  console.error('Missing STRIPE_SECRET_KEY');
  process.exit(1);
}
if (LIVE) {
  if (!SECRET.startsWith('sk_live_')) {
    console.error('Refusing non-live STRIPE_SECRET_KEY with --live (expected sk_live_…)');
    process.exit(1);
  }
} else if (!SECRET.startsWith('sk_test_')) {
  console.error('Refusing non-test STRIPE_SECRET_KEY (expected sk_test_…). Pass --live for production.');
  process.exit(1);
}

const stripe = new Stripe(SECRET, { maxNetworkRetries: 2, timeout: 20000 });

/** Keep prices in sync with app/software/src/data/catalog.ts */
const CATALOG = [
  { id: 'agency', name: 'Agency Website Kit', priceThb: 3500 },
  { id: 'admin', name: 'SaaS Admin Dashboard', priceThb: 4000 },
  { id: 'commerce', name: 'E-commerce Storefront', priceThb: 4500 },
  { id: 'landing', name: 'SaaS Landing Page', priceThb: 5000 },
  { id: 'mobile', name: 'Mobile App UI Starter', priceThb: 5500 },
  { id: 'crm', name: 'CRM & Sales Dashboard', priceThb: 6000 },
  { id: 'finance', name: 'Finance Overview Dashboard', priceThb: 6500 },
  { id: 'restaurant', name: 'Restaurant & Cafe Website', priceThb: 7000 },
  { id: 'real-estate', name: 'Real Estate Listings', priceThb: 7500 },
  { id: 'portfolio', name: 'Creative Portfolio Studio', priceThb: 8000 },
  { id: 'booking', name: 'Booking & Appointments', priceThb: 3500 },
  { id: 'education', name: 'Online Course Platform', priceThb: 4000 },
];

/** Curated featured templates (TEMPLATES in templatesData.ts) — stable lookup keys. */
const CURATED_TEMPLATES = [
  { id: 'luma', name: 'Luma Creative Studio', priceThb: 3500 },
  { id: 'nova', name: 'Nova Admin Dashboard', priceThb: 4000 },
  { id: 'forma', name: 'Forma Goods Store', priceThb: 4500 },
  { id: 'flow', name: 'Flow Wellness App UI', priceThb: 5000 },
  { id: 'arc', name: 'Arc Architecture Portfolio', priceThb: 5500 },
  { id: 'spark', name: 'Spark Finance Dashboard', priceThb: 6000 },
  { id: 'kinetix', name: 'Kinetix AI SaaS Landing', priceThb: 6500 },
  { id: 'atelier', name: 'Atelier Culinary & Hospitality', priceThb: 7000 },
  { id: 'pulse', name: 'Pulse DevOps & Status Portal', priceThb: 7500 },
];

const TEMPLATE_PRICE_TIERS = [
  3500, 4000, 4500, 5000, 5500, 6000, 6500, 7000, 7500, 8000,
];

/** Keep in sync with app/software/src/data/htmlTemplateFiles.ts */
const HTML_TEMPLATE_FILES = [
  'accessories_eyewear.html',
  'atlas_haul_freight.html',
  'aura_alchemy_fashion.html',
  'blog_template_preview.html',
  'books_stationery.html',
  'botanica_bloom.html',
  'creative_portfolio.html',
  'crumb_crown_bakery.html',
  'crunch_crush_burger_co.html',
  'electronics_technology.html',
  'fashion_boutique_landing_page.html',
  'kinetic_stride_footwear.html',
  'kornerstone_living(1).html',
  'kornerstone_living.html',
  'landing_page(1).html',
  'landing_page(2).html',
  'landing_page(3).html',
  'landing_page(4).html',
  'landing_page(5).html',
  'landing_page(6).html',
  'landing_page(7).html',
  'landing_page(8).html',
  'landing_page(9).html',
  'landing_page(10).html',
  'landing_page(11).html',
  'landing_page(12).html',
  'landing_page(13).html',
  'landing_page(14).html',
  'landing_page(15).html',
  'landing_page(16).html',
  'landing_page(17).html',
  'landing_page(18).html',
  'landing_page(19).html',
  'landing_page(20).html',
  'landing_page.html',
  'local_personal_services.html',
  'ngo_charity.html',
  'nomad_compass_travel.html',
  'pawprint_palace(1).html',
  'pawprint_palace.html',
  'vanguard_constructions.html',
  'velvet_bean_coffee_roastery.html',
];

function templatePriceThb(index) {
  return TEMPLATE_PRICE_TIERS[index % TEMPLATE_PRICE_TIERS.length];
}

function sanitizeLookupSlug(filename) {
  return filename
    .replace(/\.html$/i, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, 80);
}

function templateName(filename) {
  return filename.replace(/\.html$/i, '').replace(/_/g, ' ').trim();
}

async function assertAccount() {
  const account = await stripe.accounts.retrieve();
  if (EXPECTED_ACCOUNT && account.id !== EXPECTED_ACCOUNT) {
    console.error(`Stripe account mismatch: got ${account.id}, expected ${EXPECTED_ACCOUNT}`);
    process.exit(1);
  }
  console.log(`Stripe account: ${account.id} (${LIVE ? 'live' : 'test'})`);
}

/**
 * Find an existing product by metadata onefin_lookup, or create one.
 * @param {string} productLookup
 * @param {string} name
 * @param {Record<string, string>} metadata
 */
async function ensureProduct(productLookup, name, metadata) {
  // Page through active products looking for our lookup metadata (bounded).
  let startingAfter;
  for (let page = 0; page < 20; page++) {
    const listed = await stripe.products.list({
      limit: 100,
      active: true,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    const hit = listed.data.find((p) => p.metadata?.onefin_lookup === productLookup);
    if (hit) {
      const needsUpdate =
        hit.name !== name ||
        hit.metadata?.kind !== metadata.kind ||
        hit.metadata?.item_id !== metadata.item_id ||
        hit.metadata?.price_thb !== metadata.price_thb;
      if (needsUpdate) {
        return stripe.products.update(hit.id, {
          name,
          metadata: { ...hit.metadata, ...metadata, onefin_lookup: productLookup },
        });
      }
      return hit;
    }
    if (!listed.has_more) break;
    startingAfter = listed.data[listed.data.length - 1]?.id;
    if (!startingAfter) break;
  }

  return stripe.products.create({
    name,
    metadata: { ...metadata, onefin_lookup: productLookup },
  });
}

/**
 * Ensure one-time THB price with lookup_key.
 * @param {string} productId
 * @param {string} priceLookupKey
 * @param {number} unitAmount
 * @param {Record<string, string>} metadata
 */
async function ensurePrice(productId, priceLookupKey, unitAmount, metadata) {
  const byKey = await stripe.prices.list({
    lookup_keys: [priceLookupKey],
    active: true,
    limit: 1,
  });

  if (byKey.data[0]) {
    const existing = byKey.data[0];
    if (
      existing.unit_amount === unitAmount &&
      existing.currency === 'thb' &&
      !existing.recurring &&
      existing.product === productId
    ) {
      return existing;
    }
    // Stale amount or product: clear lookup_key and deactivate, then create fresh.
    await stripe.prices.update(existing.id, { active: false, lookup_key: '' });
  }

  const onProduct = await stripe.prices.list({
    product: productId,
    active: true,
    limit: 30,
  });
  const match = onProduct.data.find(
    (p) => p.unit_amount === unitAmount && p.currency === 'thb' && !p.recurring,
  );
  if (match) {
    if (match.lookup_key !== priceLookupKey) {
      try {
        return await stripe.prices.update(match.id, {
          lookup_key: priceLookupKey,
          transfer_lookup_key: true,
        });
      } catch {
        return match;
      }
    }
    return match;
  }

  return stripe.prices.create({
    product: productId,
    currency: 'thb',
    unit_amount: unitAmount,
    lookup_key: priceLookupKey,
    transfer_lookup_key: true,
    metadata,
  });
}

async function deactivateUsdPrice(productId, priceLookupKey) {
  const usdLookupKey = priceLookupKey.replace(/_thb$/, '_usd');
  const listed = await stripe.prices.list({
    lookup_keys: [usdLookupKey],
    active: true,
    limit: 2,
  });
  for (const price of listed.data) {
    if (
      price.product === productId &&
      price.currency === 'usd' &&
      price.type === 'one_time'
    ) {
      await stripe.prices.update(price.id, { active: false });
    }
  }
}

async function provisionOne({ kind, id, name, priceThb, productLookup, priceLookup }) {
  const unitAmount = priceThb * 100;
  const meta = {
    kind,
    item_id: id,
    price_thb: String(priceThb),
  };
  const product = await ensureProduct(productLookup, name, meta);
  const price = await ensurePrice(product.id, priceLookup, unitAmount, {
    ...meta,
    onefin_product_lookup: productLookup,
  });
  await stripe.products.update(product.id, { default_price: price.id });
  await deactivateUsdPrice(product.id, priceLookup);
  return {
    kind,
    id,
    name,
    priceThb,
    productId: product.id,
    priceId: price.id,
    productLookup,
    priceLookup,
  };
}

async function main() {
  await assertAccount();

  /** @type {Record<string, { productId: string, priceId: string, priceThb: number, kind: string, lookup: string }>} */
  const catalogMap = {};
  const rows = [];

  console.log(`\nProvisioning ${CATALOG.length} catalog products…`);
  for (const item of CATALOG) {
    const productLookup = `onefin_software_catalog_${item.id}`;
    const priceLookup = `onefin_software_catalog_${item.id}_thb`;
    const row = await provisionOne({
      kind: 'software',
      id: item.id,
      name: `OneFin Software · ${item.name}`,
      priceThb: item.priceThb,
      productLookup,
      priceLookup,
    });
    rows.push(row);
    catalogMap[`software:${item.id}`] = {
      productId: row.productId,
      priceId: row.priceId,
      priceThb: row.priceThb,
      kind: 'software',
      lookup: productLookup,
    };
    console.log(`  ✓ catalog ${item.id}  ฿${item.priceThb}`);
  }

  console.log(`\nProvisioning ${HTML_TEMPLATE_FILES.length} template products…`);
  console.log(`
Provisioning ${CURATED_TEMPLATES.length} curated templates…`);
  for (const item of CURATED_TEMPLATES) {
    const productLookup = `onefin_software_template_${item.id}`;
    const priceLookup = `onefin_software_template_${item.id}_thb`;
    const row = await provisionOne({
      kind: 'template',
      id: item.id,
      name: `OneFin Template · ${item.name}`,
      priceThb: item.priceThb,
      productLookup,
      priceLookup,
    });
    rows.push(row);
    catalogMap[`template:${item.id}`] = {
      productId: row.productId,
      priceId: row.priceId,
      priceThb: row.priceThb,
      kind: 'template',
      lookup: productLookup,
    };
    console.log(`  ✓ curated template ${item.id}  ฿${item.priceThb}`);
  }

  for (let i = 0; i < HTML_TEMPLATE_FILES.length; i++) {
    const filename = HTML_TEMPLATE_FILES[i];
    const slug = sanitizeLookupSlug(filename);
    const priceThb = templatePriceThb(i);
    const productLookup = `onefin_software_template_${slug}`;
    const priceLookup = `onefin_software_template_${slug}_thb`;
    const row = await provisionOne({
      kind: 'template',
      id: filename,
      name: `OneFin Template · ${templateName(filename)}`,
      priceThb,
      productLookup,
      priceLookup,
    });
    rows.push(row);
    catalogMap[`template:${filename}`] = {
      productId: row.productId,
      priceId: row.priceId,
      priceThb: row.priceThb,
      kind: 'template',
      lookup: productLookup,
    };
    console.log(`  ✓ template ${slug}  ฿${priceThb}`);
  }

  const outPath = resolve(process.cwd(), LIVE ? '.stripe-software-ids.live.json' : '.stripe-software-ids.json');
  const payload = {
    generatedAt: new Date().toISOString(),
    mode: LIVE ? 'live' : 'test',
    accountHint: EXPECTED_ACCOUNT || 'unknown',
    counts: {
      catalog: CATALOG.length,
      templates: HTML_TEMPLATE_FILES.length + CURATED_TEMPLATES.length,
      total: rows.length,
    },
    items: rows,
    map: catalogMap,
  };
  writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');

  const envValue = JSON.stringify(catalogMap);
  const envSnippetPath = resolve(process.cwd(), LIVE ? '.env.stripe-software-generated.live' : '.env.stripe-software-generated');
  // Escape for dotenv single-quoted value
  const escaped = envValue.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  writeFileSync(
    envSnippetPath,
    `# Generated by scripts/provision-software-catalog.mjs — do not commit secrets/ids file if policy requires\nSTRIPE_SOFTWARE_CATALOG='${escaped}'\n`,
    'utf8',
  );

  console.log('\nDone.');
  console.log(
    `  Created/reused: ${rows.length} (catalog ${CATALOG.length} + curated ${CURATED_TEMPLATES.length} + html ${HTML_TEMPLATE_FILES.length})`,
  );
  console.log(`  Wrote ${outPath}`);
  console.log(`  Wrote ${envSnippetPath}`);
  console.log('  Sample price lookup keys:');
  for (const sample of rows.slice(0, 4)) {
    console.log(`    ${sample.priceLookup}`);
  }
  console.log(`    … +${Math.max(0, rows.length - 4)} more`);
  console.log(`  STRIPE_SOFTWARE_CATALOG JSON length: ${envValue.length} chars`);
}

main().catch((err) => {
  console.error('provision-software-catalog failed:', err?.message || err);
  process.exit(1);
});
