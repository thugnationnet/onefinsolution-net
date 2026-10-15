import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
function load(file,dependencies={}) {
 const exports={}; const {outputText}=ts.transpileModule(readFileSync(new URL(`../${file}`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}});
 runInNewContext(outputText,{exports,require:name=>name==='server-only'?{}:dependencies[name]||require(name),Buffer,process,console}); return exports;
}
test('native authentication signs users in without email verification, hashes passwords and revokes sessions on reset',async()=>{
 const db=new PGlite(); const sent=[];
 try {
  await db.exec(readFileSync(new URL('../migrations/railway/001_schema.sql',import.meta.url),'utf8'));
  const password=load('lib/password.ts');
  const auth=load('lib/auth-service.ts',{
   './password':password,'./email':{emailConfigured:()=>true,sendAuthEmail:async(email,url,purpose)=>sent.push({email,url,purpose})},'./site-url':{siteUrl:()=> 'https://onefin.example.test'},
   './db':{query:async(sql,args)=>(await db.query(sql,args)).rows,transaction:async work=>db.transaction(tx=>work({query:(sql,args)=>tx.query(sql,args)}))}
  });
  await assert.rejects(auth.register('bad-email','a-secure-password'),/valid email/);
  await assert.rejects(password.hashPassword('short'),/12 and 128/);
  const registration=await auth.register('  Person@Example.test ','first-secure-password');
  const [user]=(await db.query('select * from app_users')).rows;
  assert.equal(registration.id,user.id);
  assert.equal(registration.email,user.email);
  assert.equal(user.email,'person@example.test'); assert.ok(!user.password_hash.includes('first-secure-password'));
  assert.ok(user.email_verified_at,'New registrations are immediately usable without a verification email.');
  assert.equal(sent.length,0,'Registration does not require configured email delivery.');
  assert.equal(await auth.authenticate(user.email,'first-secure-password'),user.id);
  await assert.rejects(auth.register(user.email,'another-secure-password'),/already exists/);
  await assert.rejects(auth.authenticate(user.email,'incorrect-password'),/incorrect/);
  await db.query('update app_users set email_verified_at=null where id=$1',[user.id]);
  assert.equal(await auth.authenticate(user.email,'first-secure-password'),user.id,'Existing unverified users can sign in.');
  await auth.requestEmailToken(user.email,'verify');
  const verification=new URL(sent[0].url).searchParams.get('token');
  assert.equal(await auth.consumeVerification(verification),user.id);
  await assert.rejects(auth.consumeVerification(verification),/expired/);
  assert.equal(await auth.authenticate(user.email,'first-secure-password'),user.id);
  const jar=new Map();
  const sessionModule=load('lib/session.ts',{'./password':password,'./session-cookie':{sessionCookie:'onefin-session',legacySessionCookie:null,sessionCookieOptions:maxAge=>({httpOnly:true,secure:false,sameSite:'lax',path:'/',maxAge})},'./db':{query:async(sql,args)=>(await db.query(sql,args)).rows},'next/headers':{cookies:async()=>({get:name=>jar.has(name)?{value:jar.get(name).value}:undefined,set:(name,value,options)=>options.maxAge===0?jar.delete(name):jar.set(name,{value,options}),delete:name=>jar.delete(name)})},react:{cache:fn=>fn}});
  await sessionModule.createSession(user.id);
  const savedCookie=jar.get(sessionModule.sessionCookie);
  assert.equal(savedCookie.options.httpOnly,true); assert.equal(savedCookie.options.sameSite,'lax');
  assert.equal((await sessionModule.userFromToken(savedCookie.value)).id,user.id);
  assert.equal(await sessionModule.userFromToken('forged'),null);
  await db.query("update app_sessions set expires_at=now()-interval '1 minute'");
  assert.equal(await sessionModule.userFromToken(savedCookie.value),null);
  await sessionModule.destroySession(); assert.equal(jar.size,0);
  const session=password.randomToken();
  await db.query("insert into app_sessions(token_hash,user_id,expires_at) values($1,$2,now()+interval '1 day')",[password.tokenHash(session),user.id]);
  assert.notEqual(session,password.tokenHash(session));
  await auth.requestEmailToken(user.email,'reset');
  const reset=new URL(sent.at(-1).url).searchParams.get('token');
  await auth.resetPassword(reset,'second-secure-password');
  assert.equal((await db.query('select * from app_sessions')).rows.length,0);
  await assert.rejects(auth.resetPassword(reset,'another-secure-password'),/expired/);
  await assert.rejects(auth.authenticate(user.email,'first-secure-password'),/incorrect/);
  assert.equal(await auth.authenticate(user.email,'second-secure-password'),user.id);
  await auth.requestEmailToken(user.email,'reset');
  const expired=new URL(sent.at(-1).url).searchParams.get('token');
  await db.query("update auth_tokens set expires_at=now()-interval '1 minute'");
  await assert.rejects(auth.resetPassword(expired,'expired-password-change'),/expired/);
  const before=sent.length;
  await auth.requestEmailToken('unknown@example.test','reset'); assert.equal(sent.length,before);
  await auth.throttle('rate-fixture',1); await assert.rejects(auth.throttle('rate-fixture',1),/Too many attempts/);
 } finally {await db.close();}
});
