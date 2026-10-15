#!/usr/bin/env node
/**
 * Provision Stripe test Products + one-time Prices for the software storefront.
 * Idempotent via price lookup_keys. Does not change PaymentIntent amount logic.
 *
 * Usage: npm run stripe:provision-software
 * Env: STRIPE_SECRET_KEY (sk_test_…), optional STRIPE_EXPECTED_ACCOUNT_ID
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

if (!SECRET) {
  console.error('Missing STRIPE_SECRET_KEY');
  process.exit(1);
}
if (!SECRET.startsWith('sk_test_')) {
  console.error('Refusing non-test STRIPE_SECRET_KEY (expected sk_test_…)');
  process.exit(1);
}

const stripe = new Stripe(SECRET, { maxNetworkRetries: 2, timeout: 20000 });

/** Keep prices in sync with app/software/src/data/catalog.ts */
const CATALOG = [
  { id: 'agency', name: 'Agency OS', priceUsd: 899 },
  { id: 'admin', name: 'Admin Console', priceUsd: 799 },
  { id: 'commerce', name: 'Commerce Suite', priceUsd: 849 },
  { id: 'landing', name: 'Landing Kit', priceUsd: 549 },
  { id: 'mobile', name: 'Mobile Shell', priceUsd: 699 },
  { id: 'crm', name: 'CRM Workspace', priceUsd: 949 },
  { id: 'finance', name: 'Finance Desk', priceUsd: 999 },
  { id: 'restaurant', name: 'Restaurant Ops', priceUsd: 749 },
  { id: 'real-estate', name: 'Real Estate Hub', priceUsd: 799 },
  { id: 'portfolio', name: 'Portfolio Site', priceUsd: 599 },
  { id: 'booking', name: 'Booking System', priceUsd: 699 },
  { id: 'education', name: 'Education Portal', priceUsd: 649 },
];

const TEMPLATE_PRICE_TIERS = [
  499, 529, 549, 579, 599, 629, 649, 679, 699, 729, 749, 779, 799, 829, 849, 879, 899, 929, 949, 979, 999,
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

function templatePriceUsd(index) {
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
  console.log(`Stripe account: ${account.id} (test)`);
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
        hit.metadata?.price_usd !== metadata.price_usd;
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
 * Ensure one-time USD price with lookup_key.
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
      existing.currency === 'usd' &&
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
    (p) => p.unit_amount === unitAmount && p.currency === 'usd' && !p.recurring,
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
    currency: 'usd',
    unit_amount: unitAmount,
    lookup_key: priceLookupKey,
    transfer_lookup_key: true,
    metadata,
  });
}

async function provisionOne({ kind, id, name, priceUsd, productLookup, priceLookup }) {
  const unitAmount = priceUsd * 100;
  const meta = {
    kind,
    item_id: id,
    price_usd: String(priceUsd),
  };
  const product = await ensureProduct(productLookup, name, meta);
  const price = await ensurePrice(product.id, priceLookup, unitAmount, {
    ...meta,
    onefin_product_lookup: productLookup,
  });
  return {
    kind,
    id,
    name,
    priceUsd,
    productId: product.id,
    priceId: price.id,
    productLookup,
    priceLookup,
  };
}

async function main() {
  await assertAccount();

  /** @type {Record<string, { productId: string, priceId: string, priceUsd: number, kind: string, lookup: string }>} */
  const catalogMap = {};
  const rows = [];

  console.log(`\nProvisioning ${CATALOG.length} catalog products…`);
  for (const item of CATALOG) {
    const productLookup = `onefin_software_catalog_${item.id}`;
    const priceLookup = `onefin_software_catalog_${item.id}_usd`;
    const row = await provisionOne({
      kind: 'software',
      id: item.id,
      name: `OneFin Software · ${item.name}`,
      priceUsd: item.priceUsd,
      productLookup,
      priceLookup,
    });
    rows.push(row);
    catalogMap[`software:${item.id}`] = {
      productId: row.productId,
      priceId: row.priceId,
      priceUsd: row.priceUsd,
      kind: 'software',
      lookup: productLookup,
    };
    console.log(`  ✓ catalog ${item.id}  $${item.priceUsd}`);
  }

  console.log(`\nProvisioning ${HTML_TEMPLATE_FILES.length} template products…`);
  for (let i = 0; i < HTML_TEMPLATE_FILES.length; i++) {
    const filename = HTML_TEMPLATE_FILES[i];
    const slug = sanitizeLookupSlug(filename);
    const priceUsd = templatePriceUsd(i);
    const productLookup = `onefin_software_template_${slug}`;
    const priceLookup = `onefin_software_template_${slug}_usd`;
    const row = await provisionOne({
      kind: 'template',
      id: filename,
      name: `OneFin Template · ${templateName(filename)}`,
      priceUsd,
      productLookup,
      priceLookup,
    });
    rows.push(row);
    catalogMap[`template:${filename}`] = {
      productId: row.productId,
      priceId: row.priceId,
      priceUsd: row.priceUsd,
      kind: 'template',
      lookup: productLookup,
    };
    console.log(`  ✓ template ${slug}  $${priceUsd}`);
  }

  const outPath = resolve(process.cwd(), '.stripe-software-ids.json');
  const payload = {
    generatedAt: new Date().toISOString(),
    accountHint: EXPECTED_ACCOUNT || 'unknown',
    counts: {
      catalog: CATALOG.length,
      templates: HTML_TEMPLATE_FILES.length,
      total: rows.length,
    },
    items: rows,
    map: catalogMap,
  };
  writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');

  const envValue = JSON.stringify(catalogMap);
  const envSnippetPath = resolve(process.cwd(), '.env.stripe-software-generated');
  // Escape for dotenv single-quoted value
  const escaped = envValue.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  writeFileSync(
    envSnippetPath,
    `# Generated by scripts/provision-software-catalog.mjs — do not commit secrets/ids file if policy requires\nSTRIPE_SOFTWARE_CATALOG='${escaped}'\n`,
    'utf8',
  );

  console.log('\nDone.');
  console.log(
    `  Created/reused: ${rows.length} (catalog ${CATALOG.length} + templates ${HTML_TEMPLATE_FILES.length})`,
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
