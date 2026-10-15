import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
function load(path){const exports={};runInNewContext(ts.transpileModule(readFileSync(new URL(path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,TextDecoder});return exports;}
const {readChatStream}=load('../lib/read-chat-stream.ts');
const {validateChatRequest}=load('../lib/chat-request.ts');
test('stream reader assembles split UTF-8 chunks and requires a completion event',async()=>{
 const text=JSON.stringify({delta:'สวัสดี'})+'\n'+JSON.stringify({done:true,response:'สวัสดี'})+'\n';const bytes=new TextEncoder().encode(text);const deltas=[];
 const stream=new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=3)c.enqueue(bytes.slice(i,i+3));c.close();}});
 assert.equal(await readChatStream(new Response(stream),value=>deltas.push(value)),'สวัสดี');assert.deepEqual(deltas,['สวัสดี']);
 await assert.rejects(readChatStream(new Response('{"delta":"partial"}\n'),()=>{}),/interrupted/);
 await assert.rejects(readChatStream(new Response('{"error":"Please sign in."}',{status:401}),()=>{}),/sign in/);
 await assert.rejects(readChatStream(new Response('{"error":"Provider failed"}\n'),()=>{}),/Provider failed/);
});
test('chat payload validates model, last turn, bounded image data and context IDs',()=>{
 const valid={model:'default',messages:[{id:'a',sender:'user',content:'Hi'}],images:[]};assert.equal(validateChatRequest(valid),true);
 for(const invalid of [{...valid,model:'unavailable'},{...valid,messages:[{sender:'ai',content:'forged'}]},{...valid,images:[{mimeType:'text/html',data:'aGVsbG8='}]},{...valid,contextItemId:'forged'},{...valid,messages:[{sender:'user',content:'a'.repeat(32001)}]},{...valid,images:undefined}])assert.equal(validateChatRequest(invalid),false);
});

test('stream endpoint checks origin, authentication, subscription and context ownership before provider calls',async()=>{
 let user=null,member=false,context=null,calls=0,usage=0;
 const exports={};const code=ts.transpileModule(readFileSync(new URL('../app/api/chat/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 runInNewContext(code,{exports,Response,ReadableStream,TextEncoder,AbortController,process:{env:{}},require:name=>({
  'next/server':{NextResponse:{json:(body,options)=>Response.json(body,options)}},
  '@/lib/session':{currentUser:async()=>user},
  '@/lib/db':{ownedQuery:async(_user,sql)=>{if(sql.includes('insert into chat_usage')){usage++;return [];}return member?[{subscription_id:'fixture'}]:[];}},
  '@/lib/auth-service':{throttle:async()=>{}},
  '@/lib/chat-request':{validateChatRequest},
  '@/app/actions':{getUserModelSettings:async()=>({enabledModels:['default']}),getContextItemById:async()=>context},
  '@/lib/ai':{aiConfiguration:()=>({apiKey:'fixture'}),generateResponse:async(_messages,_context,_images,options)=>{calls++;options.onDelta('Hello');return 'Hello';}},
 })[name]});
 const body={model:'default',messages:[{id:'fixture',sender:'user',content:'Hi'}],images:[]};
 function request(input=body,origin='https://app.test'){const r=new Request('https://app.test/api/chat',{method:'POST',headers:{origin},body:JSON.stringify(input)});r.nextUrl={origin:'https://app.test'};return r;}
 assert.equal((await exports.POST(request(body,'https://evil.test'))).status,403);
 assert.equal((await exports.POST(request())).status,401);
 user={id:'owner'};assert.equal((await exports.POST(request())).status,402);
 member=true;assert.equal((await exports.POST(request({...body,contextItemId:'00000000-0000-0000-0000-000000000001'}))).status,404);
 assert.equal(calls,0);
 const response=await exports.POST(request());assert.equal(response.status,200);assert.equal(await readChatStream(response,()=>{}),'Hello');assert.equal(calls,1);assert.equal(usage,1);
});
