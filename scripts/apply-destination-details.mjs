/**
 * One-shot: read root "Destination details.txt", configure local gitignored env
 * + Railway with webhook destination settings, then DELETE the secrets file.
 *
 * Usage: node scripts/apply-destination-details.mjs [--apply-railway]
 * Never logs secret values.
 */
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DETAILS_CANDIDATES = [
  path.join(root, 'Destination details.txt'),
  path.join(root, 'Destination details.txt.txt'),
  path.join(root, 'Destination_details.txt'),
];

const APPLY_RAILWAY = process.argv.includes('--apply-railway');

function findDetailsPath() {
  for (const p of DETAILS_CANDIDATES) {
    if (existsSync(p)) return p;
  }
  return null;
}

function parseDetails(raw) {
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const out = {
    destinationId: null,
    name: null,
    endpointUrl: null,
    apiVersion: null,
    signingSecret: null,
    accountId: null,
    secretKey: null,
    publishableKey: null,
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lower = line.toLowerCase();

    // key:value inline forms from the dump
    if (/^account-id\s*:/i.test(line)) {
      out.accountId = line.split(':').slice(1).join(':').trim();
      continue;
    }
    if (/^secret-keys?\s*:/i.test(line)) {
      out.secretKey = line.split(':').slice(1).join(':').trim();
      continue;
    }
    if (/^published-keys?\s*:/i.test(line) || /^publishable-keys?\s*:/i.test(line)) {
      out.publishableKey = line.split(':').slice(1).join(':').trim();
      continue;
    }
    if (/^acct_[A-Za-z0-9]+$/.test(line)) {
      out.accountId = line;
      continue;
    }
    if (/^whsec_/.test(line)) {
      out.signingSecret = line;
      continue;
    }
    if (/^sk_(live|test)_/.test(line)) {
      out.secretKey = line;
      continue;
    }
    if (/^pk_(live|test)_/.test(line)) {
      out.publishableKey = line;
      continue;
    }
    if (/^ed_[A-Za-z0-9]+$/.test(line)) {
      out.destinationId = line;
      continue;
    }
    if (/^https?:\/\//i.test(line) && /webhook/i.test(line)) {
      out.endpointUrl = line;
      continue;
    }
    if (/^\d{4}-\d{2}-\d{2}/.test(line)) {
      out.apiVersion = line;
      continue;
    }

    // Label then next line value
    const next = lines[i + 1];
    if (!next) continue;
    if (lower === 'destination id' || lower === 'destinationid') {
      out.destinationId = next;
      i++;
    } else if (lower === 'name') {
      out.name = next;
      i++;
    } else if (lower === 'endpoint url' || lower === 'endpoint') {
      out.endpointUrl = next;
      i++;
    } else if (lower === 'api version' || lower === 'version') {
      out.apiVersion = next;
      i++;
    } else if (lower === 'signing secret' || lower === 'webhook signing secret') {
      // next may be instructional text; scan forward for whsec_
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        if (/^whsec_/.test(lines[j])) {
          out.signingSecret = lines[j];
          i = j;
          break;
        }
      }
    } else if (lower === 'account id' || lower === 'account-id' || lower === 'account') {
      out.accountId = next.replace(/^account-id\s*:/i, '').trim();
      i++;
    }
  }

  // Fallback regex scan of full text
  if (!out.signingSecret) {
    const m = raw.match(/whsec_[A-Za-z0-9]+/);
    if (m) out.signingSecret = m[0];
  }
  if (!out.destinationId) {
    const m = raw.match(/ed_[A-Za-z0-9]+/);
    if (m) out.destinationId = m[0];
  }
  if (!out.accountId) {
    const m = raw.match(/acct_[A-Za-z0-9]+/);
    if (m) out.accountId = m[0];
  }
  if (!out.secretKey) {
    const m = raw.match(/sk_(live|test)_[A-Za-z0-9]+/);
    if (m) out.secretKey = m[0];
  }
  if (!out.publishableKey) {
    const m = raw.match(/pk_(live|test)_[A-Za-z0-9]+/);
    if (m) out.publishableKey = m[0];
  }
  if (!out.endpointUrl) {
    const m = raw.match(/https?:\/\/[^\s]+\/api\/stripe\/webhook/);
    if (m) out.endpointUrl = m[0];
  }
  if (!out.apiVersion) {
    const m = raw.match(/\b(20\d{2}-\d{2}-\d{2}(?:\.[a-z]+)?)\b/);
    if (m) out.apiVersion = m[1];
  }

  return out;
}

function mask(s) {
  if (!s) return '(empty)';
  if (s.length <= 10) return `set(len=${s.length})`;
  return `${s.slice(0, 6)}…${s.slice(-4)} (len=${s.length})`;
}

function upsertEnvFile(filePath, updates) {
  let text = existsSync(filePath) ? readFileSync(filePath, 'utf8') : '';
  if (text && !text.endsWith('\n')) text += '\n';

  const keys = Object.keys(updates);
  for (const key of keys) {
    const value = updates[key];
    if (value == null || value === '') continue;
    const re = new RegExp(`^${key}=.*$`, 'm');
    const line = `${key}=${value}`;
    if (re.test(text)) {
      text = text.replace(re, line);
    } else {
      text += `${line}\n`;
    }
  }
  writeFileSync(filePath, text, 'utf8');
}

function loadEnvFile(filePath) {
  const map = {};
  if (!existsSync(filePath)) return map;
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    if (!line || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i <= 0) continue;
    map[line.slice(0, i).trim()] = line.slice(i + 1);
  }
  return map;
}

function findRailwayJs() {
  const appData = process.env.APPDATA || '';
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const candidates = [
    path.join(root, 'node_modules', '@railway', 'cli', 'bin', 'railway.js'),
    appData && path.join(appData, 'npm', 'node_modules', '@railway', 'cli', 'bin', 'railway.js'),
    home && path.join(home, 'AppData', 'Roaming', 'npm', 'node_modules', '@railway', 'cli', 'bin', 'railway.js'),
    home && path.join(home, '.npm-global', 'lib', 'node_modules', '@railway', 'cli', 'bin', 'railway.js'),
    '/usr/local/lib/node_modules/@railway/cli/bin/railway.js',
  ].filter(Boolean);
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

function railwaySet(key, value) {
  const local = {
    ...loadEnvFile(path.join(root, '.env')),
    ...loadEnvFile(path.join(root, '.env.local')),
  };
  const project = local.RAILWAY_PROJECT_ID || process.env.RAILWAY_PROJECT_ID || '';
  const service = local.RAILWAY_SERVICE_ID || process.env.RAILWAY_SERVICE_ID || '';
  const environment = local.RAILWAY_ENVIRONMENT_ID || local.RAILWAY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT || 'production';
  const token = local.RAILWAY_TOKEN || process.env.RAILWAY_TOKEN || '';

  const args = ['variables', '--set', `${key}=${value}`];
  if (project) args.push('--project', project);
  if (service) args.push('--service', service);
  if (environment) args.push('--environment', environment);

  const env = { ...process.env };
  if (token) env.RAILWAY_TOKEN = token;

  const railwayJs = findRailwayJs();
  let res;
  if (railwayJs) {
    res = spawnSync(process.execPath, [railwayJs, ...args], {
      cwd: root,
      env,
      encoding: 'utf8',
      shell: false,
    });
  } else {
    res = spawnSync('railway', args, {
      cwd: root,
      env,
      encoding: 'utf8',
      shell: true,
    });
  }
  return res;
}

function main() {
  const detailsPath = findDetailsPath();
  if (!detailsPath) {
    console.error('Destination details file not found in project root.');
    process.exit(1);
  }

  const raw = readFileSync(detailsPath, 'utf8');
  const d = parseDetails(raw);

  console.log('Parsed destination (redacted):');
  console.log('  destinationId:', mask(d.destinationId));
  console.log('  name:', d.name || '(none)');
  console.log('  endpointUrl:', d.endpointUrl || '(none)');
  console.log('  apiVersion:', d.apiVersion || '(none)');
  console.log('  signingSecret:', mask(d.signingSecret));
  console.log('  accountId:', d.accountId || '(none)');
  console.log('  secretKey:', mask(d.secretKey));
  console.log('  publishableKey:', mask(d.publishableKey));

  if (!d.signingSecret || !d.signingSecret.startsWith('whsec_')) {
    console.error('Missing/invalid webhook signing secret in destination file.');
    process.exit(1);
  }
  if (!d.endpointUrl || !d.endpointUrl.includes('/api/stripe/webhook')) {
    console.error('Endpoint URL missing or unexpected.');
    process.exit(1);
  }
  if (!d.secretKey || !/^sk_(live|test)_/.test(d.secretKey)) {
    console.error('Missing/invalid Stripe secret key in destination file.');
    process.exit(1);
  }
  if (!d.accountId || !d.accountId.startsWith('acct_')) {
    console.error('Missing/invalid Stripe account id in destination file.');
    process.exit(1);
  }

  const expectedEndpoint = 'https://onefinsolution.net/api/stripe/webhook';
  if (d.endpointUrl.replace(/\/$/, '') !== expectedEndpoint) {
    console.warn(`Warning: endpoint is ${d.endpointUrl} (expected ${expectedEndpoint})`);
  }

  const keyMode = d.secretKey.startsWith('sk_live_') ? 'live' : 'test';
  if (d.publishableKey) {
    const pkMode = d.publishableKey.startsWith('pk_live_') ? 'live' : 'test';
    if (pkMode !== keyMode) {
      console.error(`Key mode mismatch: secret=${keyMode} publishable=${pkMode}`);
      process.exit(1);
    }
  }

  const updates = {
    STRIPE_WEBHOOK_SECRET: d.signingSecret,
    STRIPE_SECRET_KEY: d.secretKey,
    STRIPE_MODE: keyMode,
    STRIPE_EXPECTED_ACCOUNT_ID: d.accountId,
  };
  if (d.publishableKey) {
    updates.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = d.publishableKey;
    updates.STRIPE_PUBLISHABLE_KEY = d.publishableKey;
  }
  if (d.destinationId) updates.STRIPE_WEBHOOK_DESTINATION_ID = d.destinationId;
  if (d.endpointUrl) updates.STRIPE_WEBHOOK_ENDPOINT_URL = d.endpointUrl;
  if (d.apiVersion) updates.STRIPE_API_VERSION = d.apiVersion;
  if (d.name) updates.STRIPE_WEBHOOK_DESTINATION_NAME = d.name;
  // Site URL for webhook endpoint host
  updates.NEXT_PUBLIC_SITE_URL = 'https://onefinsolution.net';

  // Local gitignored envs only
  const envLocal = path.join(root, '.env.local');
  const envFile = path.join(root, '.env');
  upsertEnvFile(envLocal, updates);
  console.log('Updated .env.local (gitignored)');
  if (existsSync(envFile)) {
    upsertEnvFile(envFile, updates);
    console.log('Updated .env (gitignored)');
  }

  // Non-secret docs: update .env.example account id comment only
  const examplePath = path.join(root, '.env.example');
  if (existsSync(examplePath) && d.accountId) {
    let ex = readFileSync(examplePath, 'utf8');
    ex = ex.replace(
      /^STRIPE_EXPECTED_ACCOUNT_ID=.*$/m,
      `STRIPE_EXPECTED_ACCOUNT_ID=  # ${d.accountId} (onefinsolution.net Stripe account)`,
    );
    if (!/^STRIPE_WEBHOOK_DESTINATION_ID=/m.test(ex)) {
      ex = ex.replace(
        /^STRIPE_WEBHOOK_SECRET=.*$/m,
        `STRIPE_WEBHOOK_SECRET=\n# Optional metadata from Stripe Workbench destination\n# STRIPE_WEBHOOK_DESTINATION_ID=\n# STRIPE_WEBHOOK_ENDPOINT_URL=https://onefinsolution.net/api/stripe/webhook\n# STRIPE_API_VERSION=`,
      );
    }
    writeFileSync(examplePath, ex.endsWith('\n') ? ex : ex + '\n', 'utf8');
    console.log('Updated .env.example (placeholders only, no secrets)');
  }

  if (APPLY_RAILWAY) {
    console.log('Applying to Railway...');
    const railwayKeys = [
      'STRIPE_WEBHOOK_SECRET',
      'STRIPE_SECRET_KEY',
      'STRIPE_MODE',
      'STRIPE_EXPECTED_ACCOUNT_ID',
      'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
      'STRIPE_PUBLISHABLE_KEY',
      'NEXT_PUBLIC_SITE_URL',
      'STRIPE_WEBHOOK_DESTINATION_ID',
      'STRIPE_WEBHOOK_ENDPOINT_URL',
      'STRIPE_API_VERSION',
    ];
    let ok = 0;
    let fail = 0;
    for (const key of railwayKeys) {
      const value = updates[key];
      if (!value) continue;
      const res = railwaySet(key, value);
      if (res && res.status === 0) {
        console.log(`  Railway set ${key} (${mask(value)})`);
        ok += 1;
      } else {
        const err = ((res && (res.stderr || res.stdout)) || 'unknown').toString().trim().slice(0, 180);
        console.error(`  Railway FAIL ${key}: ${err}`);
        fail += 1;
      }
    }
    console.log(`Railway done: ok=${ok} fail=${fail}`);
    if (fail > 0) {
      console.error('Railway apply had failures — destination file NOT deleted so you can retry.');
      process.exit(1);
    }
  } else {
    console.log('Skipped Railway push (pass --apply-railway to set remote vars).');
  }

  // Delete secrets file from project root
  unlinkSync(detailsPath);
  console.log(`DELETED secrets file: ${path.basename(detailsPath)}`);

  // Ensure gitignore covers future drops
  const giPath = path.join(root, '.gitignore');
  let gi = existsSync(giPath) ? readFileSync(giPath, 'utf8') : '';
  const patterns = [
    'Destination details.txt',
    'Destination details.txt.txt',
    'Destination_details.txt',
    '**/Destination details.txt',
  ];
  let giChanged = false;
  for (const p of patterns) {
    if (!gi.includes(p)) {
      gi += (gi.endsWith('\n') ? '' : '\n') + p + '\n';
      giChanged = true;
    }
  }
  if (giChanged) {
    writeFileSync(giPath, gi, 'utf8');
    console.log('Updated .gitignore to block destination detail dumps');
  }

  console.log('Done. Webhook destination configured; secrets file removed from root.');
}

main();
