#!/usr/bin/env node
/**
 * Verify Resend domain + send one live message per app template.
 * Loads .env / .env.local. Never prints API keys.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

function loadEnvFile(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const i = trimmed.indexOf('=');
    if (i < 0) continue;
    const key = trimmed.slice(0, i).trim();
    let value = trimmed.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env) || !process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(resolve(process.cwd(), '.env'));
loadEnvFile(resolve(process.cwd(), '.env.local'));
process.env.NEXT_PUBLIC_SITE_URL ||= 'https://onefinsolution.net';

const key = process.env.RESEND_API_KEY?.trim();
if (!key) {
  console.error('RESEND_API_KEY is missing in .env / .env.local');
  process.exit(1);
}
if (!key.startsWith('re_')) {
  console.error('RESEND_API_KEY does not look like a Resend key (expected re_…).');
  process.exit(1);
}

const from =
  process.env.EMAIL_FROM?.trim() ||
  process.env.RESEND_FROM?.trim() ||
  'One Fin Solution <noreply@onefinsolution.net>';

const explicitTo =
  process.argv.find((arg, i) => process.argv[i - 1] === '--to' && arg.includes('@')) ||
  process.argv.find((arg) => arg.includes('@') && !arg.startsWith('-')) ||
  process.env.EMAIL_TEST_TO?.trim() ||
  process.env.RESEND_TEST_TO?.trim() ||
  '';

console.log('Resend key: present');
console.log('From:', from);

const domainsRes = await fetch('https://api.resend.com/domains', {
  headers: { Authorization: `Bearer ${key}` },
});
const domainsBody = await domainsRes.json().catch(() => ({}));
if (!domainsRes.ok) {
  console.error('Domain list failed:', domainsRes.status, domainsBody?.message || domainsBody);
  process.exit(1);
}

const domains = domainsBody.data || [];
console.log(`Domains: ${domains.length}`);
for (const d of domains) {
  const sending = d.capabilities?.sending || 'unknown';
  console.log(`  - ${d.name} status=${d.status} sending=${sending} region=${d.region || 'n/a'}`);
}

const targetDomain = 'onefinsolution.net';
const match = domains.find((d) => d.name === targetDomain || d.name?.endsWith(`.${targetDomain}`));
if (!match) {
  console.warn(`Warning: ${targetDomain} not found on this Resend account yet.`);
} else if (match.status !== 'verified') {
  console.warn(`Warning: ${targetDomain} status is "${match.status}" (want verified). DNS may still be propagating.`);
} else {
  console.log(`Domain ${targetDomain}: verified`);
}

// Resolve recipient: prefer explicit, else Resend account email via API if available
let to = explicitTo;
if (!to) {
  const apiKeysRes = await fetch('https://api.resend.com/api-keys', {
    headers: { Authorization: `Bearer ${key}` },
  }).catch(() => null);
  // no reliable whoami — require recipient
  console.error('No test recipient. Pass --to you@email.com or set EMAIL_TEST_TO.');
  process.exit(1);
}

console.log('Test recipient:', to);
console.log('Sending all templates…');

const moduleUrl = pathToFileURL(resolve('lib/email-templates.ts')).href;
const runner = `
const to = ${JSON.stringify(to)};
const from = ${JSON.stringify(from)};
const key = process.env.RESEND_API_KEY;
const { Resend } = await import('resend');
const {
  EMAIL_TEMPLATE_IDS,
  buildEmailTemplate,
  renderEmailHtml,
  renderEmailText,
} = await import(${JSON.stringify(moduleUrl)});

const samples = {
  welcome: {
    toName: 'Boss',
    email: to,
    actionUrl: 'https://onefinsolution.net/confirmation?token=test-welcome',
  },
  login_reminder: {
    toName: 'Boss',
    actionUrl: 'https://onefinsolution.net/sign-in?token=test-login',
  },
  forgot_password: {
    toName: 'Boss',
    actionUrl: 'https://onefinsolution.net/reset-password?token=test-reset',
  },
  password_reset: {
    toName: 'Boss',
    actionUrl: 'https://onefinsolution.net/sign-in',
  },
  activity_key: {
    toName: 'Boss',
    code: '482193',
    actionUrl: 'https://onefinsolution.net/workspace',
  },
  subscription_plan_reminder: {
    toName: 'Boss',
    planName: 'Monthly',
    periodEnd: 'April 1, 2026',
    amountLabel: '$9.00 USD / month',
  },
  trial_reminder: {
    toName: 'Boss',
    planName: 'Monthly',
    trialEnd: 'March 20, 2026',
    amountLabel: '$9.00 USD / month',
  },
};

const resend = new Resend(key);
let ok = 0;
const failures = [];
for (const id of EMAIL_TEMPLATE_IDS) {
  const built = buildEmailTemplate(id, samples[id] || { toName: 'Boss' });
  const result = await resend.emails.send({
    from,
    to: [to],
    subject: '[TEST] ' + built.subject,
    html: renderEmailHtml(built),
    text: renderEmailText(built),
    tags: [
      { name: 'template', value: String(id).slice(0, 50) },
      { name: 'purpose', value: 'template-test' },
    ],
  });
  if (result.error) {
    console.error('FAIL', id, result.error.message);
    failures.push(id + ': ' + result.error.message);
    continue;
  }
  console.log('OK', id, result.data?.id || '');
  ok += 1;
}
console.log('RESULT', ok + '/' + EMAIL_TEMPLATE_IDS.length);
if (failures.length) {
  console.error(failures.join('\\n'));
  process.exit(1);
}
`;

const result = spawnSync(process.execPath, ['--import', 'tsx', '-e', runner], {
  encoding: 'utf8',
  cwd: process.cwd(),
  env: process.env,
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status ?? 1);
