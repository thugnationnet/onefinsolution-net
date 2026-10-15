import {chromium,expect} from '@playwright/test';
import {randomUUID,randomBytes,scryptSync,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
const project=process.env.RAILWAY_PROJECT_ID;
const service=process.env.RAILWAY_DATABASE_SERVICE;
const environment=process.env.RAILWAY_ENVIRONMENT;
const executable=process.platform==='win32'?join(process.env.APPDATA,'npm/node_modules/@railway/cli/bin/railway.exe'):'railway';
if(!project||!service||!environment)throw new Error('Set RAILWAY_PROJECT_ID, RAILWAY_DATABASE_SERVICE, and RAILWAY_ENVIRONMENT.');
const status=spawnSync(executable,['status','--json'],{encoding:'utf8'});
if(status.status!==0 || JSON.parse(status.stdout).id!==project) throw new Error('Wrong Railway project.');
if(!process.env.NEXT_PUBLIC_SITE_URL)throw new Error('NEXT_PUBLIC_SITE_URL is required.');
const site=new URL(process.env.NEXT_PUBLIC_SITE_URL);
if(site.protocol!=='https:'||site.pathname!=='/'||site.search||site.hash)throw new Error('NEXT_PUBLIC_SITE_URL must be an HTTPS site origin.');
const origin=site.origin;
const id=randomUUID(),email=`smoke-${id}@example.invalid`,password=randomBytes(24).toString('base64url'),nextPassword=randomBytes(24).toString('base64url');
const salt=randomBytes(16).toString('hex'),hash=`scrypt:${salt}:${scryptSync(password,salt,64).toString('hex')}`;
function sql(statement) {
 const encoded=Buffer.from(statement).toString('base64');
 const result=spawnSync(executable,['ssh','--project',project,'--service',service,'--environment',environment,'--','sh','-c',`printf '%s' '${encoded}' | base64 -d | psql -qtAX -v ON_ERROR_STOP=1 -U postgres -d railway`],{encoding:'utf8',timeout:60000});
 if(result.status!==0) throw new Error('Railway SQL verification command failed; details suppressed.');
 return result.stdout;
}
let browser;
try {
 sql(`begin; insert into app_users(id,email,password_hash,email_verified_at) values('${id}','${email}','${hash}',now()); insert into profiles(id) values('${id}'); commit;`);
 browser=await chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{})});
 const context=await browser.newContext(); const page=await context.newPage(); const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 const health=await page.request.get(`${origin}/api/health`);expect(health.status()).toBe(200);expect((await health.json()).database).toBe('connected');
 for(const path of ['/','/about','/sign-in','/sign-up','/forgot-password','/reset-password','/confirmation','/pricing']) {
  const response=await page.goto(`${origin}${path}`);expect(response.status(),path).toBe(200);
 }
 await page.goto(`${origin}/account`);await expect(page).toHaveURL(/sign-in/);
 async function login(secret) {
  await page.goto(`${origin}/sign-in`);await page.locator('[name=email]').fill(email);await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.locator('[name=password]').fill(secret);await page.getByRole('button',{name:'Sign in',exact:true}).click();
 }
 await login(password);await expect(page).toHaveURL(`${origin}/`,{timeout:30000});
 await page.goto(`${origin}/account`);await expect(page.getByText(`Email: ${email}`,{exact:true})).toBeVisible();await expect(page.getByText('Available credits: 10',{exact:true})).toBeVisible();
 await page.locator('[name=full_name]').fill('Deployment verification');await page.getByRole('button',{name:'Save profile'}).click();await expect(page.getByText('Profile saved.',{exact:true})).toBeVisible();
 await page.reload();await expect(page.locator('[name=full_name]')).toHaveValue('Deployment verification');
 await page.goto(`${origin}/context/new`);await page.locator('#context-name').fill('Verification context');await page.locator('#context-content').fill('Temporary deployment verification content.');await page.locator('#save-context-button').click();await expect(page).toHaveURL(`${origin}/context`,{timeout:30000});await expect(page.getByText('Verification context',{exact:true})).toBeVisible();
 await page.goto(origin);await page.locator('textarea').fill('Temporary deployment verification chat.');await page.getByRole('button',{name:'Submit prompt'}).click();await expect(page).toHaveURL(/\/c\/[0-9a-f-]+/,{timeout:30000});
 await expect(page.getByText('Temporary deployment verification chat.',{exact:true})).toBeVisible();
 await page.reload();await expect(page.getByText('Temporary deployment verification chat.',{exact:true})).toBeVisible();
 const authCookies=await context.cookies();const oldSession=authCookies.find(cookie=>cookie.name==='__Secure-onefin-session');expect(oldSession.httpOnly).toBe(true);expect(oldSession.secure).toBe(true);expect(oldSession.sameSite).toBe('Lax');expect(oldSession.domain).toContain(site.hostname);
 const reset=randomBytes(32).toString('base64url'),resetHash=createHash('sha256').update(reset).digest('hex');
 sql(`insert into auth_tokens(token_hash,user_id,purpose,expires_at) values('${resetHash}','${id}','reset',now()+interval '30 minutes');`);
 await page.goto(`${origin}/auth/callback?purpose=reset&token=${reset}`);await expect(page).toHaveURL(`${origin}/reset-password`);
 await page.locator('[name=password]').fill(nextPassword);await page.locator('[name=confirmPassword]').fill(nextPassword);await page.getByRole('button',{name:'Update password'}).click();await expect(page).toHaveURL(/sign-in/,{timeout:30000});
 const stale=await browser.newContext();await stale.addCookies([oldSession]);const stalePage=await stale.newPage();await stalePage.goto(`${origin}/account`);await expect(stalePage).toHaveURL(/sign-in/);await stale.close();
 await login(nextPassword);await expect(page).toHaveURL(`${origin}/`,{timeout:30000});await page.goto(`${origin}/account`);await page.getByRole('button',{name:'Log out',exact:true}).click();await expect(page).toHaveURL(/sign-in/,{timeout:30000});expect((await context.cookies()).some(cookie=>cookie.name==='__Secure-onefin-session')).toBe(false);await page.goto(`${origin}/account`);await expect(page).toHaveURL(/sign-in/);
 await page.setViewportSize({width:375,height:812});await page.goto(origin);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.goto(`${origin}/about`);await expect(page.getByText('0115569007686',{exact:true})).toBeVisible();
 expect(errors).toEqual([]);
 console.log('PASS: domain/routes, PostgreSQL, sign-in, session persistence, profile, context/chat persistence, reset callback, reset invalidation, logout, protected routes and mobile width.');
 console.log('Email delivery, real AI and Stripe checkout require valid provider credentials and are not claimed by this verification.');
} finally {
 if(browser) await browser.close();
 sql(`delete from app_users where id='${id}' and email='${email}';`);
 console.log('Temporary verification account and dependent records removed.');
}
