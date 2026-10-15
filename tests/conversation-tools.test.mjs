import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';

test('conversation organization, branching, edit truncation and feedback enforce ownership',async()=>{
 const db=new PGlite();const owner=randomUUID(),other=randomUUID(),chat=randomUUID(),workspace=randomUUID(),first=randomUUID(),answer=randomUUID(),next=randomUUID();
 let identity={id:owner};
 try {
  for(const name of ['001_schema.sql','007_conversation_tools.sql'])await db.exec(readFileSync(new URL(`../migrations/railway/${name}`,import.meta.url),'utf8'));
  await db.query("insert into app_users(id,email,password_hash) values($1,'one@test.invalid','fixture'),($2,'two@test.invalid','fixture')",[owner,other]);
  await db.query('insert into profiles(id) values($1),($2)',[owner,other]);
  await db.query("insert into chats(id,user_id,name,area) values($1,$3,'Research','chat'),($2,$3,'Task','workspace')",[chat,workspace,owner]);
  for(const [id,sender,content,date] of [[first,'user','find the hidden keyword','2026-01-01T00:00:00.123456Z'],[answer,'ai','answer','2026-01-02'],[next,'user','follow up','2026-01-03']])await db.query('insert into messages(id,chat_id,user_id,sender,content,created_at) values($1,$2,$3,$4,$5,$6)',[id,chat,owner,sender,content,date]);
  const adapter={
   transaction:async work=>{await db.exec('begin');try{const result=await work({query:(sql,values)=>db.query(sql,values)});await db.exec('commit');return result;}catch(e){await db.exec('rollback');throw e;}},
   ownedQuery:async(user,sql,values)=>{await db.exec('begin;set local role app_user');try{await db.query("select set_config('app.user_id',$1,true)",[user]);const result=await db.query(sql,values);await db.exec('commit');return result.rows;}catch(e){await db.exec('rollback');throw e;}},
  };
  const exports={};const compiled=ts.transpileModule(readFileSync(new URL('../app/conversation-actions.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(compiled,{exports,require:name=>name==='@/lib/session'?{currentUser:async()=>identity}:name==='@/lib/db'?adapter:name==='node:crypto'?{randomUUID}:{throttle:async()=>{}}});
  assert.equal((await exports.searchConversations('chat','hidden')).length,1);
  assert.equal((await exports.searchConversations('workspace')).length,1);
  assert.equal((await exports.organizeConversation(chat,{pinned:true,project:'Planning',archived:true})).success,true);
  assert.equal((await exports.searchConversations('chat')).length,0);
  assert.equal((await exports.searchConversations('chat','Planning',true))[0].pinned,true);
  assert.equal((await exports.saveMessageFeedback(first,'positive')).success,false);
  assert.equal((await exports.saveMessageFeedback(answer,'positive')).success,true);
  const branch=await exports.duplicateConversation(chat,first);assert.equal(branch.success,true);
  assert.equal((await db.query('select * from messages where chat_id=$1',[branch.id])).rows.length,1);
  identity={id:other};
  assert.equal((await exports.searchConversations('chat','',true)).length,0);
  assert.equal((await exports.organizeConversation(chat,{archived:false})).success,false);
  assert.equal((await exports.duplicateConversation(chat)).success,false);
  assert.equal((await exports.editConversationMessage(chat,first,'forged')).success,false);
  assert.equal((await exports.saveMessageFeedback(answer,'report')).success,false);
  identity={id:owner};
  assert.equal((await exports.editConversationMessage(chat,first,'edited prompt')).success,true);
  const remaining=(await db.query('select content from messages where chat_id=$1',[chat])).rows;
  assert.deepEqual(remaining,[{content:'edited prompt'}]);
  assert.equal((await db.query('select * from message_feedback')).rows.length,0);
  identity=null;assert.equal((await exports.searchConversations('chat')).length,0);
  assert.equal((await exports.duplicateConversation(chat)).success,false);
 }finally{await db.close();}
});
