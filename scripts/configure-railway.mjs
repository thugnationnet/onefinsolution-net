/**
 * Push migration env vars from local gitignored env → Railway service.
 *
 * Usage:
 *   node scripts/configure-railway.mjs           # dry-run (default)
 *   node scripts/configure-railway.mjs --apply   # write variables
 *
 * Auth / targeting (gitignored .env.local preferred):
 *   RAILWAY_TOKEN
 *   RAILWAY_PROJECT_ID
 *   RAILWAY_SERVICE_ID
 *   RAILWAY_ENVIRONMENT_ID  (preferred) or RAILWAY_ENVIRONMENT (name)
 *
 * Invokes the Railway CLI via `node …/railway.js` (no shell) so values with
 * special characters (e.g. email "Name <addr@host>") are preserved.
 * Never logs secret values — key names only.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());

const APPLY = process.argv.includes('--apply');

const PROJECT = process.env.RAILWAY_PROJECT_ID || '';
const SERVICE = process.env.RAILWAY_SERVICE_ID || '';
const ENVIRONMENT_ID = process.env.RAILWAY_ENVIRONMENT_ID || '';
const ENVIRONMENT_NAME = process.env.RAILWAY_ENVIRONMENT || 'production';
const ENVIRONMENT = ENVIRONMENT_ID || ENVIRONMENT_NAME;
const TOKEN = process.env.RAILWAY_TOKEN || '';

/** Keys we never push to Railway (local-only / Railway-managed / test helpers). */
const NEVER_PUSH = new Set([
  'RAILWAY_TOKEN',
  'RAILWAY_PROJECT_ID',
  'RAILWAY_SERVICE_ID',
  'RAILWAY_ENVIRONMENT',
  'RAILWAY_ENVIRONMENT_ID',
  'EMAIL_TEST_TO',
  'STRIPE_PUBLISHABLE_KEY', // use NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY only
]);

/**
 * Desired production variables. Values come from local env unless `literal` is set.
 * `skipIfRemote` — do not overwrite when already present on the service (e.g. linked Postgres).
 */
const DESIRED = [
  { key: 'NODE_ENV', literal: 'production' },
  { key: 'BILLING_PROVIDER', literal: 'stripe' },
  { key: 'NEXT_PUBLIC_SITE_URL', fallback: 'https://onefinsolution.net' },
  { key: 'SESSION_COOKIE_DOMAIN', fallback: 'onefinsolution.net' },
  { key: 'SESSION_SECRET', required: true },
  { key: 'WORKSPACE_SIGNING_KEY', required: true },
  { key: 'WORKSPACE_CREDIT_COST' },
  { key: 'SIGNUP_CREDITS' },
  { key: 'XAI_API_KEY', required: true },
  { key: 'XAI_MODEL' },
  { key: 'RESEND_API_KEY', required: true },
  { key: 'EMAIL_FROM' },
  { key: 'EMAIL_FROM_AUTH' },
  { key: 'EMAIL_FROM_BILLING' },
  { key: 'EMAIL_REPLY_TO' },
  { key: 'STRIPE_MODE', fallback: 'test' },
  { key: 'STRIPE_SECRET_KEY', required: true },
  { key: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', required: true },
  { key: 'STRIPE_EXPECTED_ACCOUNT_ID', required: true },
  { key: 'STRIPE_WEBHOOK_SECRET', required: true },
  { key: 'STRIPE_CREDIT_PLANS', required: true },
  { key: 'STRIPE_SOFTWARE_CATALOG', required: false },
  { key: 'DATABASE_URL', skipIfRemote: true, required: false },
];

function redactHint(key, value) {
  if (value == null || value === '') return 'empty';
  const s = String(value);
  if (
    /SECRET|KEY|TOKEN|PASSWORD|DATABASE_URL|WEBHOOK|SIGNING/i.test(key) ||
    /^(sk_|pk_|whsec_|re_|xai-)/.test(s) ||
    /postgres(ql)?:\/\//i.test(s)
  ) {
    return `set(len=${s.length})`;
  }
  if (s.length > 60) return `set(len=${s.length})`;
  return 'set';
}

function findRailwayJs() {
  const appData = process.env.APPDATA || '';
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const candidates = [
    appData && join(appData, 'npm', 'node_modules', '@railway', 'cli', 'bin', 'railway.js'),
    home && join(home, 'AppData', 'Roaming', 'npm', 'node_modules', '@railway', 'cli', 'bin', 'railway.js'),
    home && join(home, '.npm-global', 'lib', 'node_modules', '@railway', 'cli', 'bin', 'railway.js'),
    '/usr/local/lib/node_modules/@railway/cli/bin/railway.js',
  ].filter(Boolean);
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

const RAILWAY_JS = findRailwayJs();

function railwayArgs(extra) {
  const args = [...extra];
  if (PROJECT) args.push('--project', PROJECT);
  if (SERVICE) args.push('--service', SERVICE);
  if (ENVIRONMENT) args.push('--environment', ENVIRONMENT);
  return args;
}

function runRailway(args, { allowFail = false } = {}) {
  const env = { ...process.env };
  if (TOKEN) env.RAILWAY_TOKEN = TOKEN;

  let res;
  if (RAILWAY_JS) {
    // Direct node invocation — no shell — preserves <>, spaces, JSON in values.
    res = spawnSync(process.execPath, [RAILWAY_JS, ...args], {
      encoding: 'utf8',
      env,
      shell: false,
    });
  } else {
    res = spawnSync('railway', args, {
      encoding: 'utf8',
      env,
      shell: false,
    });
    if (res.error?.code === 'ENOENT') {
      res = spawnSync('railway', args, {
        encoding: 'utf8',
        env,
        shell: true,
      });
    }
  }

  if (res.status !== 0 && !allowFail) {
    const err = (res.stderr || res.stdout || res.error?.message || '').trim();
    throw new Error(`railway ${args[0]} failed (exit ${res.status}): ${err.slice(0, 400)}`);
  }
  return res;
}

function fetchRemoteVariables() {
  const res = runRailway(railwayArgs(['variables', '--json']), { allowFail: true });
  if (res.status !== 0) {
    console.warn('Warning: could not list remote variables; DATABASE_URL skip-if-remote may be skipped.');
    return {};
  }
  try {
    const parsed = JSON.parse(res.stdout || '{}');
    if (Array.isArray(parsed)) {
      const map = {};
      for (const row of parsed) {
        const k = row.name || row.key;
        if (k) map[k] = row.value ?? '';
      }
      return map;
    }
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    console.warn('Warning: remote variables JSON parse failed.');
    return {};
  }
}

function resolveValue(spec) {
  if (Object.prototype.hasOwnProperty.call(spec, 'literal')) {
    return String(spec.literal);
  }
  const raw = process.env[spec.key];
  if (raw != null && String(raw).length > 0) return String(raw);
  if (spec.fallback != null) return String(spec.fallback);
  return null;
}

function main() {
  console.log('Railway configure');
  console.log(`  mode: ${APPLY ? 'APPLY' : 'dry-run (pass --apply to write)'}`);
  console.log(`  project: ${PROJECT || '(missing RAILWAY_PROJECT_ID)'}`);
  console.log(`  service: ${SERVICE || '(missing RAILWAY_SERVICE_ID)'}`);
  console.log(
    `  environment: ${ENVIRONMENT || '(missing)'} ${ENVIRONMENT_ID ? '(id)' : '(name)'}`,
  );
  console.log(`  token: ${TOKEN ? 'set' : 'missing'}`);
  console.log(`  cli: ${RAILWAY_JS ? 'node railway.js' : 'railway PATH'}`);

  if (!TOKEN) {
    console.error('RAILWAY_TOKEN is required (gitignored .env.local).');
    process.exit(1);
  }
  if (!PROJECT || !SERVICE || !ENVIRONMENT) {
    console.error(
      'RAILWAY_PROJECT_ID, RAILWAY_SERVICE_ID, and RAILWAY_ENVIRONMENT_ID (or RAILWAY_ENVIRONMENT) are required.',
    );
    process.exit(1);
  }

  const remote = fetchRemoteVariables();
  console.log(`  remote variables currently: ${Object.keys(remote).length} keys`);

  const toSet = [];
  const skipped = [];
  const missingRequired = [];

  for (const spec of DESIRED) {
    if (NEVER_PUSH.has(spec.key)) {
      skipped.push({ key: spec.key, reason: 'never-push' });
      continue;
    }

    const remoteHas =
      Object.prototype.hasOwnProperty.call(remote, spec.key) &&
      remote[spec.key] != null &&
      String(remote[spec.key]).length > 0;

    if (spec.skipIfRemote && remoteHas) {
      let hostHint = '';
      if (spec.key === 'DATABASE_URL') {
        try {
          const u = String(remote[spec.key]);
          const x = new URL(u.replace(/^postgresql:/i, 'http:').replace(/^postgres:/i, 'http:'));
          hostHint = ` host=${x.hostname}`;
        } catch {
          hostHint = '';
        }
      }
      skipped.push({ key: spec.key, reason: `preserve-remote${hostHint}` });
      continue;
    }

    const value = resolveValue(spec);
    if (value == null || value === '') {
      if (spec.required) missingRequired.push(spec.key);
      else skipped.push({ key: spec.key, reason: 'local-missing' });
      continue;
    }

    toSet.push({ key: spec.key, value });
  }

  if (missingRequired.length) {
    console.error('Missing required local values for:', missingRequired.join(', '));
    process.exit(1);
  }

  console.log('\nWill set:');
  for (const { key, value } of toSet) {
    console.log(`  + ${key} (${redactHint(key, value)})`);
  }
  console.log('\nSkipped:');
  for (const { key, reason } of skipped) {
    console.log(`  - ${key} (${reason})`);
  }

  if (!APPLY) {
    console.log('\nDry-run only. Re-run with --apply to write variables on Railway.');
    return;
  }

  console.log('\nApplying...');
  let ok = 0;
  let fail = 0;
  for (const { key, value } of toSet) {
    const res = runRailway(railwayArgs(['variables', '--set', `${key}=${value}`]), {
      allowFail: true,
    });
    if (res.status === 0) {
      console.log(`  set ${key}`);
      ok += 1;
    } else {
      const err = (res.stderr || res.stdout || '').trim().slice(0, 200);
      console.error(`  FAIL ${key}: ${err}`);
      fail += 1;
    }
  }

  console.log(`\nDone. set=${ok} fail=${fail}`);
  if (fail) process.exit(1);

  const after = fetchRemoteVariables();
  console.log('\nRemote verification (names):');
  for (const spec of DESIRED) {
    const present =
      Object.prototype.hasOwnProperty.call(after, spec.key) && String(after[spec.key] ?? '').length > 0;
    console.log(`  ${spec.key}: ${present ? 'present' : 'MISSING'}`);
  }
  if (Object.prototype.hasOwnProperty.call(after, 'EMAIL_TEST_TO')) {
    console.log('  EMAIL_TEST_TO: present (not required for prod)');
  } else {
    console.log('  EMAIL_TEST_TO: absent (ok)');
  }
  console.log('\nNext: confirm health/domain in Railway dashboard, then run end-to-end tests.');
}

main();
