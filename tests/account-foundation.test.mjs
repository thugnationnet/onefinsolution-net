import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
function load(file,dependencies={}) {
  const exports={};const {outputText}=ts.transpileModule(readFileSync(new URL(`../${file}`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}});
  runInNewContext(outputText,{exports,require:name=>name==='server-only'?{}:dependencies[name]||require(name),process,Buffer,console,Intl});return exports;
}
test('account preferences and support records persist with tenant isolation; password changes revoke sessions',async()=>{
  const db=new PGlite(),owner=randomUUID(),other=randomUUID();
  try {
    for(const migration of ['001_schema.sql','002_credits.sql','003_website_foundation.sql','010_user_profile_details.sql']) await db.exec(readFileSync(new URL(`../migrations/railway/${migration}`,import.meta.url),'utf8'));
    const password=load('lib/password.ts');
    const hash=await password.hashPassword('original-test-password');
    await db.query('insert into app_users(id,email,password_hash,email_verified_at) values($1,$2,$3,now()),($4,$5,$3,now())',[owner,'one@example.test',hash,other,'other@example.test']);
    await db.query('insert into profiles(id) values($1),($2)',[owner,other]);
    const adapter={query:async(sql,args)=>(await db.query(sql,args)).rows,transaction:work=>db.transaction(tx=>work({query:(sql,args)=>tx.query(sql,args)})),ownedQuery:(id,sql,args)=>db.transaction(async tx=>{await tx.query('set local role app_user');await tx.query("select set_config('app.user_id',$1,true)",[id]);return (await tx.query(sql,args)).rows;})};
    const preferences=load('lib/account-preferences.ts');
    const account=load('lib/account-service.ts',{'./db':adapter,'./password':password,'./account-preferences':preferences});
    const form=new FormData();form.set('theme','dark');form.set('timezone','Europe/London');form.set('spellcheck','on');
    await account.writePreferences(owner,preferences.parsePreferences(form));
    assert.equal((await account.readPreferences(owner)).theme,'dark');
    assert.equal((await account.readPreferences(owner)).enter_to_send,false);
    assert.equal((await account.readPreferences(other)).theme,'system');
    form.set('timezone','not/a-zone');assert.throws(()=>preferences.parsePreferences(form),/time zone/);
    form.set('theme','invalid');assert.throws(()=>preferences.parsePreferences(form),/appearance/);
    assert.equal((await adapter.ownedQuery(other,'select * from account_settings',[])).length,0);
    await assert.rejects(adapter.ownedQuery(other,"insert into account_settings(user_id) values($1)",[owner]),/row-level security/);
    const auth=load('lib/auth-service.ts',{'./db':adapter,'./password':password,'./email':{},'./site-url':{}});
    const support=load('lib/support-service.ts',{'./db':adapter,'./auth-service':auth});
    const request=new FormData();for(const [key,value] of Object.entries({name:'Test user',email:'spoof@example.test',category:'technical',subject:'Cannot load conversation',message:'Please help investigate this error in my saved conversation.'})) request.set(key,value);
    const id=await support.submitSupportRequest(request,{id:owner,email:'one@example.test'},'fixture');
    const [saved]=await adapter.ownedQuery(owner,'select * from support_requests where id=$1',[id]);
    assert.equal(saved.email,'one@example.test');
    assert.equal((await adapter.ownedQuery(other,'select * from support_requests',[])).length,0);
    await assert.rejects(adapter.ownedQuery(owner,"update support_requests set status='resolved' where id=$1",[id]),/permission denied/);
    request.set('message','short');await assert.rejects(support.submitSupportRequest(request,null,'fixture'),/Enter/);
    const first=password.tokenHash('first'),second=password.tokenHash('second'),third=password.tokenHash('third');
    for(const [token,user] of [[first,owner],[second,owner],[third,other]]) await db.query("insert into app_sessions(token_hash,user_id,expires_at) values($1,$2,now()+interval '1 day')",[token,user]);
    await assert.rejects(auth.changePassword(owner,'wrong-password','new-valid-password'),/incorrect/);
    assert.equal((await adapter.query('select * from app_sessions where user_id=$1',[owner])).length,2);
    assert.equal((await adapter.query('select * from app_sessions where user_id=$1',[other])).length,1);
    await auth.changePassword(owner,'original-test-password','new-valid-password');
    assert.equal((await adapter.query('select * from app_sessions where user_id=$1',[owner])).length,0);
    assert.equal((await adapter.query('select * from app_sessions where user_id=$1',[other])).length,1);
    const [changed]=await adapter.query('select password_hash from app_users where id=$1',[owner]);
    assert.equal(await password.verifyPassword('new-valid-password',changed.password_hash),true);
  } finally {await db.close();}
});
