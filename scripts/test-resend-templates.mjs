#!/usr/bin/env node
/**
 * Renders + optionally sends all One Fin email templates via Resend.
 *
 * Usage:
 *   npm run test:email
 *   npm run test:email:send -- you@example.com
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
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(resolve(process.cwd(), '.env.local'));
loadEnvFile(resolve(process.cwd(), '.env'));
process.env.NODE_ENV ||= 'development';
process.env.NEXT_PUBLIC_SITE_URL ||= 'https://onefinsolution.net';

const sendFlag = process.argv.includes('--send');
const explicitTo =
  process.argv.find((arg, i) => process.argv[i - 1] === '--send' && arg.includes('@')) ||
  process.argv.find((arg) => arg.includes('@') && arg !== '--send');
const to = explicitTo || process.env.EMAIL_TEST_TO || process.env.RESEND_TEST_TO || '';
const moduleUrl = pathToFileURL(resolve('lib/email-templates.ts')).href;

const runner = `
process.env.NEXT_PUBLIC_SITE_URL ||= 'https://onefinsolution.net';
const sendFlag = ${sendFlag ? 'true' : 'false'};
const to = ${JSON.stringify(to)};
const {
  EMAIL_TEMPLATE_IDS,
  buildEmailTemplate,
  renderEmailHtml,
  renderEmailText,
} = await import(${JSON.stringify(moduleUrl)});

const samples = {
  welcome: {
    toName: 'Alex',
    email: to || 'alex@example.com',
    actionUrl: 'https://onefinsolution.net/confirmation?token=test-welcome',
  },
  login_reminder: {
    toName: 'Alex',
    actionUrl: 'https://onefinsolution.net/sign-in?token=test-login',
  },
  forgot_password: {
    toName: 'Alex',
    actionUrl: 'https://onefinsolution.net/reset-password?token=test-reset',
  },
  password_reset: {
    toName: 'Alex',
    actionUrl: 'https://onefinsolution.net/sign-in',
  },
  activity_key: {
    toName: 'Alex',
    code: '482193',
    actionUrl: 'https://onefinsolution.net/workspace',
  },
  subscription_plan_reminder: {
    toName: 'Alex',
    planName: 'Monthly',
    periodEnd: 'April 1, 2026',
    amountLabel: '$9.00 USD / month',
  },
  trial_reminder: {
    toName: 'Alex',
    planName: 'Monthly',
    trialEnd: 'March 20, 2026',
    amountLabel: '$9.00 USD / month',
  },
};

console.log('Templates:', EMAIL_TEMPLATE_IDS.length);
for (const id of EMAIL_TEMPLATE_IDS) {
  const built = buildEmailTemplate(id, samples[id] || { toName: 'Alex' });
  const html = renderEmailHtml(built);
  const text = renderEmailText(built);
  console.log('✓', id, '-', built.subject);
  if (!html.includes(built.heading) || !text.includes(built.heading)) {
    throw new Error('Render failed for ' + id);
  }
}

if (!sendFlag) {
  console.log('\\nDry-run complete. Re-run with --send you@domain.com to deliver via Resend.');
  process.exit(0);
}

if (!to) {
  console.error('Missing recipient. Pass --send you@domain.com or set EMAIL_TEST_TO.');
  process.exit(1);
}

if (!process.env.RESEND_API_KEY && !(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD)) {
  console.error('No provider configured. Set RESEND_API_KEY (preferred) or SMTP_*.');
  process.exit(1);
}

const from =
  process.env.EMAIL_FROM ||
  process.env.RESEND_FROM ||
  'One Fin Solution <noreply@onefinsolution.net>';

let sent = 0;
if (process.env.RESEND_API_KEY) {
  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  for (const id of EMAIL_TEMPLATE_IDS) {
    const built = buildEmailTemplate(id, samples[id] || { toName: 'Alex' });
    const result = await resend.emails.send({
      from,
      to: [to],
      subject: '[TEST] ' + built.subject,
      html: renderEmailHtml(built),
      text: renderEmailText(built),
      tags: [
        { name: 'template', value: id },
        { name: 'purpose', value: 'template-test' },
      ],
    });
    if (result.error) {
      console.error('✗', id + ':', result.error.message);
      process.exitCode = 1;
      continue;
    }
    console.log('→ sent', id, 'id=' + (result.data?.id || 'unknown'));
    sent += 1;
  }
} else {
  const nodemailer = (await import('nodemailer')).default;
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
  });
  for (const id of EMAIL_TEMPLATE_IDS) {
    const built = buildEmailTemplate(id, samples[id] || { toName: 'Alex' });
    const info = await transport.sendMail({
      from,
      to,
      subject: '[TEST] ' + built.subject,
      html: renderEmailHtml(built),
      text: renderEmailText(built),
    });
    console.log('→ sent', id, 'id=' + info.messageId);
    sent += 1;
  }
}

console.log('\\nSent ' + sent + '/' + EMAIL_TEMPLATE_IDS.length + ' template test emails to ' + to);
`;

const result = spawnSync(process.execPath, ['--import', 'tsx', '-e', runner], {
  encoding: 'utf8',
  cwd: process.cwd(),
  env: process.env,
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status ?? 1);
