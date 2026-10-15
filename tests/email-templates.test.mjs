import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

test('all required email templates render subject, html, and text', () => {
  const moduleUrl = pathToFileURL(resolve('lib/email-templates.ts')).href;
  const script = `
    process.env.NEXT_PUBLIC_SITE_URL = 'https://onefinsolution.net';
    const {
      EMAIL_TEMPLATE_IDS,
      buildEmailTemplate,
      renderEmailHtml,
      renderEmailText,
    } = await import(${JSON.stringify(moduleUrl)});
    const required = [
      'welcome',
      'login_reminder',
      'forgot_password',
      'password_reset',
      'activity_key',
      'subscription_plan_reminder',
      'trial_reminder',
    ];
    for (const id of required) {
      if (!EMAIL_TEMPLATE_IDS.includes(id)) throw new Error('missing ' + id);
      const built = buildEmailTemplate(id, {
        toName: 'Alex',
        email: 'alex@example.com',
        actionUrl: '/sign-in',
        code: '123456',
        planName: 'Monthly',
        trialEnd: 'March 20, 2026',
        periodEnd: 'April 1, 2026',
        amountLabel: '$9.00 USD / month',
        note: 'Manage renewals anytime from Plans & billing.',
      });
      if (!built.subject || built.subject.length < 5) throw new Error('bad subject ' + id);
      const html = renderEmailHtml(built);
      const text = renderEmailText(built);
      if (!html.includes('One Fin Solution')) throw new Error('html brand ' + id);
      if (!html.includes(built.heading)) throw new Error('html heading ' + id);
      if (!text.includes(built.heading)) throw new Error('text heading ' + id);
      if (!html.includes('onefinsolution.net') || !text.includes('onefinsolution.net')) throw new Error('configured site domain missing ' + id);
      if (id === 'activity_key' && !html.includes('123456')) throw new Error('code missing');
    }
    console.log('OK ' + required.length);
  `;

  const result = spawnSync(process.execPath, ['--import', 'tsx', '-e', script], {
    encoding: 'utf8',
    cwd: process.cwd(),
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'template test failed').slice(0, 2000));
  }
  assert.match(result.stdout, /OK 7/);
});
