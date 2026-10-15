import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';

test('Workspace analyzes validated images, saves successful turns and charges atomically; failures refund and cross-account tasks fail',async()=>{
 const db=new PGlite();const owner=randomUUID(),other=randomUUID(),chat=randomUUID();let identity={id:owner},fail=false,receivedImages=[];
 try {
 for(const name of readdirSync(new URL('../migrations/railway/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())await db.exec(readFileSync(new URL(`../migrations/railway/${name}`,import.meta.url),'utf8'));
 await db.query("insert into app_users(id,email,password_hash) values($1,'workspace@fixture.test','fixture'),($2,'other@fixture.test','fixture')",[owner,other]);
 await db.query('insert into profiles(id) values($1),($2)',[owner,other]);await db.query("select grant_credits($1,'fixture',10)",[owner]);
 const adapter={query:async(sql,values)=>(await db.query(sql,values)).rows,transaction:work=>db.transaction(tx=>work({query:(sql,values)=>tx.query(sql,values)}))};
 const credits={reserveWorkspaceCredits:async user=>{const id=randomUUID();await db.query('select reserve_credits($1,$2,1)',[user,id]);return id;},finishWorkspaceCredits:async(user,id,success)=>db.query('select finish_credit_usage($1,$2,$3)',[user,id,success])};
 const exports={};const code=ts.transpileModule(readFileSync(new URL('../app/api/workspace/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 runInNewContext(code,{exports,console,process:{env:{}},Buffer,require:name=>({
 'next/server':{NextResponse:{json:(body,options)=>Response.json(body,options)}},'@/lib/session':{currentUser:async()=>identity},'@/lib/db':adapter,'@/lib/auth-service':{throttle:async()=>{}},'@/lib/credits':credits,'node:crypto':{randomUUID},'@/lib/ai':{generateResponse:async(_messages,_context,images)=>{receivedImages=images;if(fail)throw new Error('Private provider details');return 'Successful fixture answer';}},
 })[name]});
 const request=(images=undefined)=>{const r=new Request('https://app.test/api/workspace',{method:'POST',headers:{origin:'https://app.test'},body:JSON.stringify({conversationId:chat,messages:[{sender:'user',content:'Task prompt'}],...(images===undefined?{}:{images})})});r.nextUrl={origin:'https://app.test'};return r;};
 const image={mimeType:'image/png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pOcAAAAASUVORK5CYII='};
 const response=await exports.POST(request([image]));assert.equal(response.status,200);const result=await response.json();assert.equal(result.balance,9);
 assert.equal(JSON.stringify(receivedImages),JSON.stringify([image]));
 assert.equal((await exports.POST(request([{mimeType:'image/png',data:'aGVsbG8='}]))).status,400,'Mismatched image content is rejected before credit reservation.');
 assert.equal((await db.query('select area from chats where id=$1',[chat])).rows[0].area,'workspace');
 assert.equal((await db.query('select count(*)::int as count from messages where chat_id=$1',[chat])).rows[0].count,2);
 assert.equal((await db.query('select status from credit_usage')).rows[0].status,'completed');
 fail=true;const failed=await exports.POST(request());assert.equal(failed.status,503);assert.equal(JSON.stringify(await failed.json()).includes('Private provider details'),false);
 assert.equal((await db.query('select available_credits($1)::int as balance',[owner])).rows[0].balance,9);
 assert.equal((await db.query('select count(*)::int as count from messages where chat_id=$1',[chat])).rows[0].count,2);
 assert.equal((await db.query("select count(*)::int as count from credit_usage where status='refunded'")).rows[0].count,1);
 identity={id:other};assert.equal((await exports.POST(request())).status,404);
 identity=null;assert.equal((await exports.POST(request())).status,401);
 }finally{await db.close();}
});
