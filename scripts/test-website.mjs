// Isolated end-to-end verification. Never connects to Railway or real providers.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {randomUUID,createHash,scryptSync} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';
import {chromium} from '@playwright/test';

const port=Number(process.env.WEBSITE_TEST_PORT||3015),dbPort=Number(process.env.WEBSITE_TEST_DB_PORT||55435);
const origin=`http://localhost:${port}`;
const artifacts=new URL('../.test-artifacts/website/',import.meta.url);
mkdirSync(artifacts,{recursive:true});
// Use a real local PostgreSQL process: the PGlite wire adapter cannot reliably
// multiplex the application's concurrent transactions and extended queries.
const cluster=new EmbeddedPostgres({databaseDir:fileURLToPath(new URL(`postgres-${randomUUID()}/`,artifacts)),user:'postgres',password:'postgres',port:dbPort,persistent:true,initdbFlags:['--no-locale','--encoding=UTF8','--locale-provider=libc'],postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}});
await cluster.initialise();
await cluster.start();
const connection=cluster.getPgClient();
await connection.connect();
const db={query:(sql,args)=>connection.query(sql,args),exec:sql=>connection.query(sql),close:()=>connection.end()};
for(const migration of readdirSync(new URL('../migrations/railway/',import.meta.url)).filter(name=>name.endsWith('.sql')).sort()) await db.exec(readFileSync(new URL(`../migrations/railway/${migration}`,import.meta.url),'utf8'));
await db.exec("create table app_migrations(name text primary key,checksum text not null,applied_at timestamptz not null default now()); insert into app_migrations(name,checksum) values ('001_schema.sql','fixture'),('002_credits.sql','fixture'),('003_website_foundation.sql','fixture'),('004_trials_workspace.sql','fixture'),('005_workspace_credits.sql','fixture');");
const user=randomUUID(),other=randomUUID(),chat=randomUUID();
const password='browser-fixture-password';
const hash=`scrypt-v1:fixture-salt:${scryptSync(password,'fixture-salt',64,{N:32768,r:8,p:3,maxmem:64*1024*1024}).toString('hex')}`;
await db.query('insert into app_users(id,email,password_hash,email_verified_at) values($1,$2,$3,now()),($4,$5,$3,now())',[user,'browser@example.test',hash,other,'other@example.test']);
await db.query('insert into profiles(id,full_name) values($1,$2),($3,$4)',[user,'Browser Fixture',other,'Other Private User']);
await db.query('insert into chats(id,user_id,name) values($1,$2,$3)',[chat,user,'My saved conversation']);
await db.query("insert into chats(user_id,name) values($1,'Other user private conversation')",[other]);
await db.query("insert into messages(chat_id,user_id,sender,content) values($1,$2,'user','My fixture message')",[chat,user]);
process.env.SESSION_COOKIE_DOMAIN='localhost';
const resetToken='r'.repeat(43);
await db.query("insert into auth_tokens(token_hash,user_id,purpose,expires_at) values($1,$2,'reset',now()+interval '30 minutes')",[createHash('sha256').update(resetToken).digest('hex'),user]);
const app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{cwd:new URL('../',import.meta.url),windowsHide:true,env:{...process.env,NODE_ENV:'production',DATABASE_POOL_MAX:'10',DATABASE_URL:`postgresql://postgres:postgres@127.0.0.1:${dbPort}/postgres`,NEXT_PUBLIC_SITE_URL:'https://onefinsolution.net',STRIPE_SECRET_KEY:'',STRIPE_WEBHOOK_SECRET:'',SMTP_HOST:'',OPENAI_API_KEY:'',XAI_API_KEY:'',SIGNUP_CREDITS:'10',WORKSPACE_SIGNING_KEY:'website-fixture-security-key-over-32-chars'},stdio:['ignore','pipe','pipe']});
let logs='';app.stdout.on('data',chunk=>{logs+=chunk;});app.stderr.on('data',chunk=>{logs+=chunk;});
let browser, page;const failures=[];let checks=0;const pending=new Set();const actionLog=[];
try {
  let ready=false;
  for(let attempt=0;attempt<90;attempt++){try {const response=await fetch(`${origin}/api/health`);if(response.ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,500));}
  assert.ok(ready,'Local application must start');
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000},extraHTTPHeaders:{'x-real-ip':'203.0.113.20'}});
  page=await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror',error=>failures.push(error.message));
  page.on('request',request=>{pending.add(request);if(request.method()==='POST')actionLog.push(['start',new URL(request.url()).pathname,request.headers()['next-action']]);});
  page.on('requestfinished',request=>{pending.delete(request);if(request.method()==='POST')actionLog.push(['done',new URL(request.url()).pathname]);});
  page.on('requestfailed',request=>{pending.delete(request);actionLog.push(['failed',new URL(request.url()).pathname,request.failure()?.errorText]);});
  async function check(path,title){console.log(`Checking ${path}`);const response=await page.goto(`${origin}${path}`);assert.equal(response.status(),200,path);await page.getByRole('heading',{level:1,name:title}).waitFor();assert.equal(await page.locator('h1').count(),1,`${path}: one page heading`);if(path!=='/')assert.ok(await page.locator('footer').isVisible());checks++;}
  if(!process.argv.includes('--features-only')) {
  await check('/',/Build custom chatbots/);
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'),'https://onefinsolution.net','Homepage canonical URL');
  assert.equal(await page.locator('meta[property="og:title"]').getAttribute('content'),'One Fin Solution | AI Chat and Software Workspace');
  assert.ok((await page.locator('meta[property="og:image"]').first().getAttribute('content'))?.includes('/images/iages4.jpg'),'Homepage Open Graph preview image');
  assert.ok((await page.locator('link[rel="icon"][type="image/png"]').getAttribute('href'))?.includes('/logo/one-fin-logo.png'),'Brand logo is configured as the site icon');
  const faviconResponse=await context.request.get(`${origin}/favicon.ico`);
  assert.equal(faviconResponse.status(),200,'Google-compatible favicon is available');
  const favicon=Buffer.from(await faviconResponse.body());
  assert.equal(favicon.readUInt16LE(4),4,'Favicon includes multiple icon sizes');
  assert.equal(favicon[6+2*16],48,'Favicon includes a 48px Google Search icon');
  const organizationData=JSON.parse(await page.locator('script[type="application/ld+json"]').first().textContent());
  assert.equal(organizationData[0]['@type'],'Organization');
  assert.equal(organizationData[0].logo,'https://onefinsolution.net/logo/one-fin-logo.png');
  const sitemapResponse=await context.request.get(`${origin}/sitemap.xml`);
  assert.equal(sitemapResponse.status(),200,'Sitemap is available');
  const sitemapText=await sitemapResponse.text();
  for(const publicPath of ['/','/about','/pricing','/contact','/support','/privacy','/terms','/payment-policy'])assert.ok(sitemapText.includes(`https://onefinsolution.net${publicPath}`),`Sitemap includes ${publicPath}`);
  assert.equal(sitemapText.includes('/workspace'),false,'Private Workspace is excluded from the sitemap');
  const robotsResponse=await context.request.get(`${origin}/robots.txt`);
  assert.equal(robotsResponse.status(),200,'Robots rules are available');
  const robotsText=await robotsResponse.text();
  assert.ok(robotsText.includes('Sitemap: https://onefinsolution.net/sitemap.xml'));
  assert.ok(robotsText.includes('Disallow: /dashboard'));
  checks+=6;
  assert.ok(await page.getByRole('textbox',{name:'Message'}).isVisible(),'Homepage shows the subscription chat composer');
  assert.ok(await page.locator('.home-chat-sidebar').isVisible(),'Homepage shows its dedicated chat sidebar');
  assert.ok(await page.getByRole('button',{name:'New chat'}).isVisible(),'Homepage can start a new chat');
  assert.ok(await page.getByRole('button',{name:'customer support',exact:true}).isVisible(),'Homepage offers prompt starters');
  const profileButton=page.locator('.home-chat-sidebar .profile-button');
  await profileButton.waitFor();
  await profileButton.click();
  const profileMenu=page.getByRole('region',{name:'Profile and application menu'});
  assert.ok(await profileMenu.getByRole('link',{name:'Dashboard'}).isVisible(),'Profile menu contains the account dashboard');
  assert.ok(await profileMenu.getByRole('link',{name:'Workspace app'}).isVisible(),'Profile menu contains Workspace app');
  assert.ok(await profileMenu.getByRole('link',{name:'Context'}).isVisible(),'Profile menu contains Context');
  assert.ok(await profileMenu.getByRole('link',{name:'Account',exact:true}).isVisible(),'Profile menu contains account settings');
  assert.ok(await profileMenu.getByRole('link',{name:'Contact'}).isVisible(),'Profile menu contains contact support');
  assert.ok(await profileMenu.getByRole('link',{name:'Company information'}).isVisible(),'Profile menu contains company information');
  await profileMenu.getByRole('link',{name:'Sign up'}).waitFor({state:'visible'});
  assert.ok(await profileMenu.getByRole('link',{name:'Sign up'}).isVisible(),'Signed-out users see Sign up');
  assert.ok(await profileMenu.getByRole('link',{name:'Sign in'}).isVisible(),'Signed-out users see Sign in');
  assert.equal(await profileMenu.getByRole('button',{name:'Settings'}).count(),0,'Signed-out users do not see authenticated settings');
  await profileButton.click();
  await page.getByRole('button',{name:'Collapse sidebar'}).click();
  assert.ok(await page.getByRole('button',{name:'Expand sidebar'}).isVisible(),'Homepage sidebar can be reopened from its collapsed state');
  for(const label of ['Search conversations','New chat','Dashboard','Workspace','Context','Open profile menu'])assert.ok(await page.getByRole(label==='Dashboard'||label==='Workspace'||label==='Context'?'link':'button',{name:label}).isVisible(),`Collapsed homepage rail shows ${label} icon`);
  assert.ok(await page.locator('.home-chat-sidebar-rail .home-brand-logo').isVisible(),'Collapsed homepage rail retains the logo');
  await page.getByRole('button',{name:'Expand sidebar'}).click();
  await page.waitForFunction(()=>document.querySelector('.home-chat-sidebar')?.getBoundingClientRect().width>200);
  assert.ok(await page.getByRole('button',{name:'Start speech input'}).isVisible(),'Homepage composer exposes speech-to-text');
  assert.equal(await page.getByText(/daily message cap|visitor allowance/i).count(),0,'Homepage does not advertise guest access');
  assert.equal(await page.locator('footer').count(),0,'Chat homepage fills the viewport without the marketing footer');
  assert.equal(await page.locator('.site-header').count(),0,'Chat homepage has no public marketing header');
  await page.screenshot({path:new URL('home-desktop.png',artifacts).pathname.replace(/^\/([A-Z]:)/,'$1'),fullPage:true});
  await page.getByRole('button',{name:'customer support',exact:true}).click();
  assert.equal(await page.getByRole('textbox',{name:'Message'}).inputValue(),'customer support','Conversation starters fill the composer');
  await page.getByRole('button',{name:'New chat'}).click();
  assert.equal(new URL(page.url()).pathname,'/','New chat stays on the homepage chat route');
  await page.getByRole('textbox',{name:'Message'}).fill('');
  page.setViewportSize({width:390,height:844});
  await page.goto(`${origin}/support`);
  await page.getByRole('button',{name:'Open navigation menu'}).click();
  assert.ok(await page.getByRole('navigation',{name:'Mobile navigation'}).getByRole('link',{name:'Help center'}).isVisible(),'Mobile navigation opens with public links');
  await page.getByRole('navigation',{name:'Mobile navigation'}).getByRole('link',{name:'Help center'}).click();
  await page.waitForURL('**/support');
  assert.equal(new URL(page.url()).pathname,'/support','Mobile sidebar links navigate correctly');
  page.setViewportSize({width:1440,height:1000});
  for(const [path,title] of [['/about','Software with a practical purpose.'],['/privacy','Privacy Policy'],['/terms','Terms & Conditions'],['/payment-policy','Payment, Cancellation & Refund Policy'],['/support','A little help goes a long way.'],['/contact','Let’s get you to the right place.'],['/pricing','Choose the time that fits your work.'],['/forgot-password','Forgot your password?'],['/reset-password','Request a fresh reset link.'],['/sign-in','Your workspace is waiting.'],['/sign-up','A place for your next idea.']]) await check(path,title);
  for(const path of ['/dashboard','/dashboard/activity','/dashboard/billing','/account/security']){await page.goto(`${origin}${path}`);assert.equal(new URL(page.url()).pathname,'/sign-in');checks++;}
  await page.goto(`${origin}/workspace`);await page.getByRole('heading',{level:1,name:'Build something useful.'}).waitFor();assert.equal(await page.locator('.home-chat-sidebar').count(),0,'Guest Workspace view is separate from homepage chat');await page.getByRole('button',{name:'Collapse Workspace navigation'}).click();for(const label of ['Overview','Credits and usage','Payment settings','Transactions','Activity','Account settings','Sign in to Workspace'])assert.ok(await page.locator(`.workspace-sidebar a[aria-label="${label}"]`).isVisible(),`Collapsed Workspace rail shows ${label} icon`);assert.ok(await page.locator('.workspace-brand-mark').isVisible(),'Collapsed Workspace rail retains the logo');await page.getByRole('button',{name:'Expand Workspace navigation'}).click();assert.ok(await page.getByText('Sign in when you’re ready to use Workspace.',{exact:true}).isVisible());await page.getByRole('textbox',{name:'Describe a Workspace task'}).fill('Build a sample website');await page.getByRole('button',{name:'Sign in to run'}).click();assert.ok(await page.getByRole('dialog').getByRole('link',{name:'Sign in'}).isVisible(),'Workspace requests login only when a guest tries to use it');checks++;
  await page.goto(`${origin}/chat`);assert.equal(new URL(page.url()).pathname,'/sign-in');checks++;
  await page.goto(`${origin}/pricing`);
  for(const interval of ['Daily','Weekly','Monthly','Yearly']) assert.ok(await page.getByRole('heading',{name:interval,exact:true}).isVisible());
  await page.getByRole('link',{name:'Start daily trial',exact:true}).click();await page.getByRole('heading',{level:1,name:'Daily: $5 USD / day'}).waitFor();assert.ok(await page.getByRole('link',{name:'Sign in to continue'}).isVisible());checks++;
  await page.goto(`${origin}/support`);await page.getByLabel('Search the help center').fill('forgot');assert.equal(await page.locator('details').count(),1);await page.locator('summary').click();assert.ok(await page.getByText('The link lasts 30 minutes',{exact:false}).isVisible());checks++;
  await page.goto(`${origin}/contact`);await page.getByLabel('Your name').fill('Guest Fixture');await page.getByLabel('Email address').fill('guest@example.test');await page.getByLabel('Subject',{exact:true}).fill('Guest support question');await page.getByLabel(/^Message/).fill('Please help me understand which plan interval fits my needs.');await page.getByRole('button',{name:'Submit request',exact:true}).click();await page.getByRole('heading',{name:'Thank you for reaching out.'}).waitFor();checks++;
  await page.goto(`${origin}/sign-up`);assert.ok(await page.getByText('No email verification is required.').isVisible());await page.getByLabel('Email address').fill('new-signup@example.test');await page.locator('input[name="password"]').fill('new-signup-fixture-password');await page.locator('input[name="accept_terms"]').check();await page.getByRole('button',{name:'Create account',exact:true}).click();await page.waitForURL('**/dashboard');await page.getByRole('heading',{name:'Welcome to your account.'}).waitFor();const registered=(await db.query("select email,email_verified_at from app_users where email='new-signup@example.test'")).rows[0];assert.ok(registered?.email_verified_at,'New signup is active without email verification');checks++;
  await page.goto(`${origin}/`);await page.locator('.home-chat-sidebar .profile-button').click();await page.getByRole('region',{name:'Profile and application menu'}).getByRole('button',{name:'Sign out'}).click();await page.waitForURL('**/sign-in');
  await db.query('update app_users set email_verified_at=null where id=$1',[user]);
  await page.goto(`${origin}/sign-in`);await page.getByLabel('Email address').fill('browser@example.test');await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL('**/dashboard');await page.getByRole('heading',{name:'Welcome back, Browser.'}).waitFor();assert.ok(await page.getByRole('link',{name:'My saved conversation',exact:true}).isVisible());assert.equal(await page.getByText('Other user private conversation',{exact:true}).count(),0);checks++;
  await page.goto(`${origin}/`);await page.locator('.home-chat-sidebar .profile-button').click();const signedInMenu=page.getByRole('region',{name:'Profile and application menu'});await signedInMenu.getByRole('button',{name:'Settings'}).waitFor({state:'visible'});assert.ok(await signedInMenu.getByRole('button',{name:'Settings'}).isVisible(),'Signed-in profile menu offers Settings');assert.ok(await signedInMenu.getByRole('button',{name:'Sign out'}).isVisible(),'Signed-in profile menu offers Sign out');assert.equal(await signedInMenu.getByRole('link',{name:'Sign in'}).count(),0);await signedInMenu.getByRole('button',{name:'Settings'}).click();const settings=page.getByRole('dialog',{name:'Settings'});await settings.waitFor();assert.ok(await settings.getByRole('tab',{name:'Account'}).isVisible());assert.ok(await settings.getByRole('tab',{name:'Models'}).isVisible());assert.ok(await settings.getByRole('tab',{name:'Subscription'}).isVisible());await settings.getByRole('button',{name:'Close settings'}).click();await settings.waitFor({state:'detached'});checks++;
  } else {
    // A real database-backed session isolates conversation tests from unrelated form redirects.
    const token='s'.repeat(43);await db.query("insert into app_sessions(token_hash,user_id,expires_at) values($1,$2,now()+interval '1 day')",[createHash('sha256').update(token).digest('hex'),user]);
    await context.addCookies([{name:'__Secure-onefin-session',value:token,domain:'localhost',path:'/',secure:true,httpOnly:true,sameSite:'Lax'}]);
  }
  // Conversation features use persisted fixtures, never external AI calls.
  const answerId=randomUUID();
  await db.query("insert into messages(id,chat_id,user_id,sender,content) values($1,$2,$3,'ai',$4)",[answerId,chat,user,'## Rendered answer\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```js\nconst answer = 42;\n```']);
  await page.goto(`${origin}/c/${chat}`);await page.getByRole('heading',{name:'Rendered answer'}).waitFor();
  assert.equal(await page.locator('.message-markdown table').count(),1);assert.ok(await page.getByRole('button',{name:'Copy code',exact:true}).isVisible());
  await context.grantPermissions(['clipboard-read','clipboard-write']);await page.getByRole('button',{name:'Copy code',exact:true}).click();assert.equal((await page.evaluate(()=>navigator.clipboard.readText())).trim(),'const answer = 42;');
  assert.equal(await page.locator('.home-chat-sidebar').count(),1,'Saved conversations keep the chat navigation shell');
  await page.getByRole('button',{name:'Helpful',exact:true}).click();await page.getByText('Feedback saved.',{exact:true}).waitFor();
  assert.equal((await db.query('select rating from message_feedback where message_id=$1',[answerId])).rows[0].rating,'positive');checks++;
  page.on('dialog',async dialog=>{if(dialog.type()==='prompt')await dialog.accept('My fixture message edited');else await dialog.accept();});
  await page.getByRole('button',{name:'Edit',exact:true}).click();await page.getByText('Edit saved. Send a follow-up to continue.',{exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'Rendered answer'}).count(),0);
  assert.equal((await db.query('select count(*)::int as count from messages where chat_id=$1',[chat])).rows[0].count,1,'Editing retains the selected message at full timestamp precision');
  await page.reload();await page.getByText('My fixture message edited',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Branch here',exact:true}).click();await page.waitForURL(url=>url.pathname.startsWith('/c/')&&url.pathname!==`/c/${chat}`);
  const branchId=new URL(page.url()).pathname.split('/').at(-1);assert.equal((await db.query('select count(*)::int as count from messages where chat_id=$1',[branchId])).rows[0].count,1);
  await db.query('delete from chats where id=$1',[branchId]);await page.goto(`${origin}/c/${chat}`);await page.getByText('My fixture message edited',{exact:true}).waitFor();checks++;

  await page.locator('summary').filter({hasText:'Manage chats and projects'}).click();
  const manager=page.getByRole('region',{name:'chat conversations'});
  await manager.getByRole('searchbox').fill('fixture message');await manager.getByRole('button',{name:'My saved conversation',exact:true}).waitFor();
  assert.equal(await manager.getByRole('button',{name:'Other user private conversation',exact:true}).count(),0);
  await manager.locator('summary').click();await manager.getByRole('button',{name:'Pin',exact:true}).click();await manager.getByRole('button',{name:'Unpin',exact:true}).waitFor();
  await manager.getByRole('button',{name:'Archive',exact:true}).click();await manager.getByText('No conversations found.',{exact:true}).waitFor();
  await manager.getByRole('checkbox',{name:'Archived'}).check();await manager.getByRole('button',{name:/My saved conversation/}).waitFor();await manager.locator('summary').click();await manager.getByRole('button',{name:'Restore',exact:true}).click();await manager.getByText('No conversations found.',{exact:true}).waitFor();checks++;
  const taskId=randomUUID();await db.query("insert into chats(id,user_id,name,area) values($1,$2,'Saved Workspace task','workspace')",[taskId,user]);
  await db.query("insert into messages(chat_id,user_id,sender,content,created_at) values($1,$2,'user','Persisted task prompt',now()-interval '1 second'),($1,$2,'ai','Persisted task answer',now())",[taskId,user]);
  await page.goto(`${origin}/workspace?task=${taskId}`);await page.getByText('Persisted task answer',{exact:true}).waitFor();await page.reload();await page.getByText('Persisted task answer',{exact:true}).waitFor();
  const taskManager=page.getByRole('region',{name:'workspace conversations'});await taskManager.getByRole('button',{name:'Saved Workspace task',exact:true}).waitFor();
  await page.locator('input[type=file]').setInputFiles({name:'notes.csv',mimeType:'text/csv',buffer:Buffer.from('name,value\na,1')});await page.getByRole('button',{name:'Remove notes.csv'}).waitFor();await page.getByRole('button',{name:'Remove notes.csv'}).click();
  await page.locator('input[type=file]').setInputFiles({name:'unsafe.pdf',mimeType:'application/pdf',buffer:Buffer.from('unsupported')});await page.getByRole('alert').filter({hasText:'Use supported text files'}).waitFor();
  for(const width of [768,390]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Saved Workspace task layout fits the viewport');assert.ok(await page.locator('.workspace-task-messages').evaluate(element=>element.scrollWidth<=element.clientWidth+1),'Task messages do not clip horizontally');}
  await page.screenshot({path:fileURLToPath(new URL('chat-workspace-mobile.png',artifacts)),fullPage:true});
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:fileURLToPath(new URL('chat-workspace-desktop.png',artifacts)),fullPage:true});
  const rejected=await context.request.post(`${origin}/api/workspace`,{headers:{Origin:origin},data:{conversationId:chat,messages:[{sender:'user',content:'Wrong area'}]}});assert.equal(rejected.status(),404);
  await db.query('delete from chats where id=$1',[taskId]);checks++;
  if(!process.argv.includes('--features-only')) {
  await page.goto(`${origin}/workspace`);await page.getByRole('heading',{level:1,name:'Build something useful.'}).waitFor();
  assert.equal(await page.locator('.home-chat-sidebar').count(),0,'Workspace never mounts the homepage chat sidebar');
  assert.equal(await page.locator('.site-header, footer').count(),0,'Workspace keeps its dedicated app shell');
  assert.ok(await page.getByRole('textbox',{name:'Describe a Workspace task'}).isVisible(),'Authenticated Workspace provides the task composer');
  assert.equal(await page.locator('.workspace-balance-card strong').innerText(),'10','Workspace displays the signed-in user credit balance');
  assert.ok(await page.getByRole('button',{name:/Add 50 credits/}).isDisabled(),'Checkout remains disabled without the Stripe publishable key');
  await page.getByRole('textbox',{name:'Describe a Workspace task'}).fill('Hello fixture');
  await page.getByRole('button',{name:'Run task'}).click();
  await page.getByRole('alert').filter({hasText:'AI is not configured'}).waitFor();
  await page.reload();await page.getByRole('heading',{level:1,name:'Build something useful.'}).waitFor();
  assert.equal(await page.locator('.workspace-balance-card strong').innerText(),'10','Failed Workspace task returns the reserved credit');
  assert.equal((await db.query("select count(*)::int as count from credit_usage where user_id=$1 and status='refunded'",[user])).rows[0].count,1);
  await db.query("update credit_buckets set remaining=0 where user_id=$1 and reference=$2",[user,`signup:${user}`]);
  await page.reload();await page.getByRole('heading',{level:1,name:'Build something useful.'}).waitFor();await page.getByRole('textbox',{name:'Describe a Workspace task'}).fill('Try with no available credits');await page.getByRole('button',{name:'Run task'}).click();await page.getByRole('dialog').getByRole('heading',{name:'Add credits to continue'}).waitFor();checks++;
  await page.getByRole('dialog').getByRole('button',{name:'Not now'}).click();await db.query("update credit_buckets set remaining=10 where user_id=$1 and reference=$2",[user,`signup:${user}`]);
  await page.goto(`${origin}/`);await page.locator('.home-chat-sidebar .profile-button').click();await page.getByRole('region',{name:'Profile and application menu'}).getByRole('link',{name:'Dashboard'}).click();await page.waitForURL('**/dashboard');await page.getByRole('heading',{name:'Welcome back, Browser.'}).waitFor();assert.equal(new URL(page.url()).pathname,'/dashboard','Dashboard profile-menu link opens the dashboard rather than Workspace');checks++;
  await page.goto(`${origin}/`);await page.locator('.home-chat-sidebar .profile-button').click();await page.getByRole('region',{name:'Profile and application menu'}).getByRole('link',{name:'Context'}).click();await page.waitForURL('**/context');assert.equal(new URL(page.url()).pathname,'/context','Context profile-menu link opens its own page');checks++;
  await page.goto(`${origin}/`);await page.locator('.home-chat-sidebar .profile-button').click();await page.getByRole('region',{name:'Profile and application menu'}).getByRole('link',{name:'Account',exact:true}).click();await page.waitForURL('**/account');await page.getByRole('heading',{name:'Make yourself at home.'}).waitFor();assert.equal(new URL(page.url()).pathname,'/account','Account profile-menu link opens its own page');checks++;
  await page.goto(`${origin}/`);await page.locator('.home-chat-sidebar .profile-button').click();await page.getByRole('region',{name:'Profile and application menu'}).getByRole('link',{name:'Workspace app'}).click();await page.waitForURL('**/workspace');assert.equal(new URL(page.url()).pathname,'/workspace','Workspace profile-menu link opens Workspace');checks++;
  page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'Workspace has no mobile horizontal overflow');
  assert.ok(await page.getByRole('textbox',{name:'Describe a Workspace task'}).isVisible(),'Workspace task composer remains usable on mobile');
  page.setViewportSize({width:1440,height:1000});
  checks++;
  await page.screenshot({path:new URL('workspace-desktop.png',artifacts).pathname.replace(/^\/([A-Z]:)/,'$1'),fullPage:true});
  await page.goto(`${origin}/account`);await page.getByLabel('Full name',{exact:true}).fill('Updated Browser');await page.getByLabel(/^Username/).fill('browser_fixture');await page.getByLabel('Website',{exact:true}).fill('https://example.test');await page.getByRole('button',{name:'Save profile',exact:true}).click();await page.getByRole('status').filter({hasText:'Profile saved.'}).waitFor();await page.reload();assert.equal(await page.getByLabel('Full name',{exact:true}).inputValue(),'Updated Browser');checks++;
  await page.goto(`${origin}/account/preferences`);await page.getByLabel('Appearance',{exact:true}).selectOption('dark');await page.getByLabel('Time zone',{exact:false}).selectOption('UTC');await page.getByLabel('Enter to send',{exact:false}).uncheck();await page.getByLabel('Browser spellcheck',{exact:false}).uncheck();await page.getByRole('button',{name:'Save preferences',exact:true}).click();await page.getByRole('status').filter({hasText:'Preferences saved.'}).waitFor();await page.reload();assert.equal(await page.getByLabel('Appearance',{exact:true}).inputValue(),'dark');assert.equal(await page.getByLabel('Enter to send',{exact:false}).isChecked(),false);checks++;
  await page.goto(`${origin}/chat`);await page.waitForURL(url=>url.pathname==='/');await page.getByRole('textbox',{name:'Message',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('textarea')?.spellcheck===false);await page.getByRole('textbox',{name:'Message',exact:true}).fill('Do not send this');await page.getByRole('textbox',{name:'Message',exact:true}).press('Shift+Enter');assert.equal(new URL(page.url()).pathname,'/');assert.ok((await page.getByRole('textbox',{name:'Message',exact:true}).inputValue()).includes('\n'));checks++;
  await page.goto(`${origin}/contact?category=technical`);await page.getByLabel('Your name').fill('Browser Fixture');await page.getByLabel('Subject',{exact:true}).fill('Signed in request');await page.getByLabel(/^Message/).fill('Please help with a question about my saved workspace settings.');await page.getByRole('button',{name:'Submit request',exact:true}).click();await page.getByRole('heading',{name:'Thank you for reaching out.'}).waitFor();await page.goto(`${origin}/dashboard/support`);await page.getByRole('heading',{name:'Signed in request',exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'Guest support question',exact:true}).count(),0);checks++;
  const exported=await context.request.get(`${origin}/api/account/export`);assert.equal(exported.status(),200);const data=await exported.json();assert.equal(data.account.email,'browser@example.test');assert.equal(data.profile.full_name,'Updated Browser');assert.equal(data.chats.length,1);assert.equal(JSON.stringify(data).includes('password_hash'),false);assert.equal(JSON.stringify(data).includes('Other user private'),false);checks++;
  for(const path of ['/account/security','/account/plugins','/account/privacy','/dashboard/activity','/dashboard/billing']){const response=await page.goto(`${origin}${path}`);assert.equal(response.status(),200);await page.locator('h1').waitFor();assert.equal(await page.getByRole('heading',{name:/Something went wrong/}).count(),0);checks++;}
  await page.goto(`${origin}/dashboard/activity`);await page.getByRole('button',{name:'Delete',exact:true}).click();await page.getByRole('button',{name:'Keep it',exact:true}).click();assert.ok(await page.getByRole('link',{name:'My saved conversation',exact:true}).isVisible());await page.getByRole('button',{name:'Delete',exact:true}).click();await page.getByRole('button',{name:'Delete permanently',exact:true}).click();await page.getByText('No conversations yet.',{exact:false}).waitFor();checks++;
  await context.clearCookies();await context.addCookies([{name:'onefin-reset',value:resetToken,url:origin,httpOnly:true,sameSite:'Lax'}]);await page.goto(`${origin}/reset-password`);await page.getByLabel('New password',{exact:true}).fill('browser-replacement-password');await page.getByLabel('Confirm new password',{exact:true}).fill('browser-replacement-password');await page.getByRole('button',{name:'Update password',exact:true}).click();await page.waitForURL('**/sign-in?success=*');checks++;
  await page.goto(`${origin}/forgot-password`);await page.getByLabel('Email address').fill('browser@example.test');await page.getByRole('button',{name:'Send reset link',exact:true}).click();await page.getByRole('status').filter({hasText:'If an account exists, a reset link has been sent.'}).waitFor();checks++;
  await page.goto(`${origin}/workspace`);await page.getByRole('heading',{level:1,name:'Build something useful.'}).waitFor();assert.equal(await page.locator('.home-chat-sidebar').count(),0,'Unauthenticated Workspace requests do not reveal homepage chat');assert.match(await page.locator('meta[name="robots"]').getAttribute('content')||'',/noindex/,'Workspace is excluded from indexing');checks++;
  await page.setViewportSize({width:390,height:844});
  for(const path of ['/','/pricing','/support','/contact','/privacy','/forgot-password','/workspace']){await page.goto(`${origin}${path}`);await page.locator('h1').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),`${path} mobile overflow`);if(path==='/'){assert.ok(await page.locator('.home-chat-sidebar-rail .sidebar-rail-logo').isVisible(),'Mobile homepage keeps the icon rail visible when its panel is closed');assert.ok(await page.getByRole('button',{name:'Open chat menu'}).isVisible(),'Mobile homepage can expand its navigation drawer');}if(path==='/workspace'){assert.ok(await page.locator('.workspace-sidebar .workspace-brand-mark').isVisible(),'Mobile Workspace keeps its icon rail visible when closed');await page.locator('.workspace-sidebar-toggle').click();assert.ok(await page.locator('.workspace-sidebar.is-mobile-expanded').isVisible(),'Mobile Workspace navigation can expand');await page.locator('.workspace-sidebar-backdrop').click({position:{x:350,y:300}});}checks++;}
  await page.goto(`${origin}/`);await page.getByRole('button',{name:'Open chat menu'}).click();await page.locator('.home-chat-sidebar .profile-button').click();await page.getByRole('region',{name:'Profile and application menu'}).getByRole('link',{name:'Company information'}).click();await page.waitForURL('**/about');await page.getByRole('heading',{level:1}).waitFor();checks++;
  await page.goto(`${origin}/pricing`);await page.getByRole('heading',{name:'Daily',exact:true}).waitFor();await page.screenshot({path:new URL('pricing-mobile.png',artifacts).pathname.replace(/^\/([A-Z]:)/,'$1'),fullPage:true});
  }
  assert.deepEqual(failures,[],'No browser JavaScript errors');
  console.log(`Passed ${checks} website checks against an isolated local database.`);
} catch(error) {
  console.error('Recent action log',actionLog.slice(-30));console.error('Pending requests',[...pending].slice(-20).map(request=>[request.method(),request.url()]));
  console.error('Database activity', (await db.query("select state,wait_event_type,wait_event,left(query,180) as query from pg_stat_activity where datname=current_database()" )).rows);
  console.error('Fixture profile', (await db.query('select full_name from profiles where id=$1',[user])).rows);
  if(page) { console.error("Failed at",page.url()); console.error((await page.locator("body").innerText().catch(()=>"No page text")).slice(0,2200)); await page.screenshot({path:new URL("failure.png",artifacts).pathname.replace(/^\/([A-Z]:)/,"$1"),fullPage:true}).catch(()=>{}); }
  throw error;
} finally {
  writeFileSync(new URL('server.log',artifacts),logs);
  await browser?.close();app.kill();if(app.exitCode===null)await new Promise(resolve=>app.once('exit',resolve));await db.close();await cluster.stop();
}
