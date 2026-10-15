import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createInterface } from 'node:readline';

const cli = process.platform === 'win32'
  ? join(process.env.APPDATA, 'npm/node_modules/@railway/cli/bin/railway.exe')
  : 'railway';
const project = process.env.RAILWAY_PROJECT_ID;
const service = process.env.RAILWAY_SERVICE_ID;
const environment = process.env.RAILWAY_ENVIRONMENT;
const accountId = process.env.STRIPE_EXPECTED_ACCOUNT_ID;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
if (!project || !service || !environment || !accountId || !siteUrl) {
  throw new Error('Set RAILWAY_PROJECT_ID, RAILWAY_SERVICE_ID, RAILWAY_ENVIRONMENT, STRIPE_EXPECTED_ACCOUNT_ID, and NEXT_PUBLIC_SITE_URL.');
}

const site = new URL(siteUrl);
if (site.protocol !== 'https:' || site.pathname !== '/' || site.search || site.hash) {
  throw new Error('NEXT_PUBLIC_SITE_URL must be an HTTPS site origin.');
}
const flags = ['--project', project, '--service', service, '--environment', environment];
const status = JSON.parse(execFileSync(cli, ['status', '--json'], { encoding: 'utf8' }));
if (status.id !== project) throw new Error('Railway project verification failed.');
const variables = JSON.parse(execFileSync(cli, ['variables', '--service', service, '--environment', environment, '--json', '--project', project], { encoding: 'utf8' }));
if (variables.NEXT_PUBLIC_SITE_URL !== site.origin) throw new Error('The target Railway service does not use NEXT_PUBLIC_SITE_URL.');

let secret;
if (process.argv.includes('--stdin-webhook')) {
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  const input = createInterface({ input: process.stdin, terminal: false });
  secret = await new Promise(resolve => input.once('line', resolve));
  input.close();
  if (!/^whsec_[a-zA-Z0-9]+$/.test(secret)) throw new Error('Invalid signing secret.');
}

const changes = {
  STRIPE_EXPECTED_ACCOUNT_ID: accountId,
  ...(!variables.WORKSPACE_SIGNING_KEY ? { WORKSPACE_SIGNING_KEY: randomBytes(32).toString('hex') } : {}),
  ...(secret ? { STRIPE_WEBHOOK_SECRET: secret } : {}),
};
for (const [name, value] of Object.entries(changes)) {
  execFileSync(cli, ['variables', 'set', name, '--stdin', '--skip-deploys', ...flags], {
    input: value,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}
console.log(`Configured names only: ${Object.keys(changes).join(', ')}. No keys printed or saved to files.`);
