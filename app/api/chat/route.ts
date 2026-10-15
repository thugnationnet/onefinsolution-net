import {NextRequest,NextResponse} from 'next/server';
import {currentUser} from '@/lib/session';
import {ownedQuery} from '@/lib/db';
import {throttle} from '@/lib/auth-service';
import {generateResponse,aiConfiguration} from '@/lib/ai';
import {validateChatRequest} from '@/lib/chat-request';
import {getUserModelSettings,getContextItemById} from '@/app/actions';
export const runtime='nodejs';
export async function POST(request:NextRequest) {
 const fail=(error:string,status:number)=>NextResponse.json({error},{status,headers:{'Cache-Control':'private, no-store'}});
 if(request.headers.get('origin')!==request.nextUrl.origin && request.headers.get('origin')!==process.env.NEXT_PUBLIC_SITE_URL)return fail('Invalid request origin.',403);
 const user=await currentUser();if(!user)return fail('Please sign in to use chat.',401);
 try {
 if(Number(request.headers.get('content-length')||0)>6000000)return fail('Message is too large.',413);
 const raw=await request.text();if(raw.length>6000000)return fail('Message is too large.',413);
 let input:unknown;try{input=JSON.parse(raw);}catch{return fail('Invalid conversation.',400);}
 if(!validateChatRequest(input))return fail('Invalid or oversized conversation or attachment.',400);
 const settings=await getUserModelSettings();if(!settings.enabledModels.includes(input.model))return fail('This model is not enabled.',400);
 const [membership]=await ownedQuery(user.id,'select subscription_id from membership_access where user_id=$1 and expires_at>now() limit 1',[user.id]);
 if(!membership)return fail('An active chat subscription is required. Choose a plan to continue.',402);
 const context=input.contextItemId?await getContextItemById(input.contextItemId):null;
 if(input.contextItemId&&!context)return fail('Context item was not found.',404);
 if(!aiConfiguration().apiKey)return fail('AI is not configured yet. Please try again later.',503);
 await throttle(`chat:${user.id}`,60);
 const abort=new AbortController();request.signal.addEventListener('abort',()=>abort.abort(),{once:true});
 const encoder=new TextEncoder();
 const stream=new ReadableStream({
 async start(controller) {
 const emit=(event:unknown)=>{if(!abort.signal.aborted)controller.enqueue(encoder.encode(JSON.stringify(event)+'\n'));};
 try {
 const response=await generateResponse(input.messages,context?.content,input.images,{onDelta:delta=>emit({delta}),signal:abort.signal});
 if(abort.signal.aborted)return;
 await ownedQuery(user.id,"insert into chat_usage(id,user_id,status,model_id) values(gen_random_uuid(),$1,'completed',$2)",[user.id,input.model]);
 emit({done:true,response});
 }catch{if(!abort.signal.aborted)emit({error:'Unable to complete the AI response. Please retry.'});}
 finally{if(!abort.signal.aborted)controller.close();}
 },cancel(){abort.abort();}
 });
 return new Response(stream,{headers:{'Content-Type':'application/x-ndjson','Cache-Control':'private, no-store','X-Accel-Buffering':'no'}});
 }catch(error){return fail(error instanceof Error&&error.message.includes('Too many')?'Too many attempts. Please try again in 15 minutes.':'Chat is temporarily unavailable.',error instanceof Error&&error.message.includes('Too many')?429:503);}
}
