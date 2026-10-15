'use server';

import { currentUser } from '@/lib/session';
import { ownedQuery, transaction } from '@/lib/db';
import { throttle } from '@/lib/auth-service';
import { randomUUID } from 'node:crypto';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function searchConversations(area: 'chat'|'workspace', search = '', archived = false) {
 const user = await currentUser();
 if (!user) return [];
 if (!['chat','workspace'].includes(area) || typeof search !== 'string' || search.length>200) throw new Error('Invalid search.');
 return ownedQuery<{id:string;title:string;pinned:boolean;archived:boolean;project:string;updated_at:string}>(user.id,
 `select c.id,coalesce(c.name,'Untitled conversation') as title,c.pinned,c.archived,c.project,c.updated_at::text
 from chats c where c.user_id=$1 and c.area=$2 and c.archived=$3
 and ($4='' or position(lower($4) in lower(coalesce(c.name,'')||' '||c.project))>0
 or exists(select 1 from messages m where m.chat_id=c.id and m.user_id=$1 and position(lower($4) in lower(m.content))>0))
 order by c.pinned desc,c.updated_at desc limit 100`,[user.id,area,archived,search.trim()]);
}
export async function organizeConversation(id:string, change:{pinned?:boolean;archived?:boolean;project?:string}) {
 const user=await currentUser();
 if(!user || !uuid.test(id)) return {success:false,error:'Conversation unavailable.'};
 if(!change || (change.pinned!==undefined && typeof change.pinned!=='boolean') || (change.archived!==undefined && typeof change.archived!=='boolean') || (change.project!==undefined && (typeof change.project!=='string' || change.project.length>100))) return {success:false,error:'Invalid organization settings.'};
 try {
 const rows=await ownedQuery(user.id,`update chats set pinned=coalesce($1,pinned),archived=coalesce($2,archived),project=coalesce($3,project),updated_at=now() where id=$4 and user_id=$5 returning id`,[change.pinned??null,change.archived??null,change.project?.trim()??null,id,user.id]);
 return {success:!!rows.length};
 } catch {return {success:false,error:'Unable to update conversation.'};}
}
export async function saveMessageFeedback(id:string,rating:'positive'|'negative'|'report',detail='') {
 const user=await currentUser();
 if(!user || !uuid.test(id) || !['positive','negative','report'].includes(rating) || typeof detail!=='string' || detail.length>2000) return {success:false,error:'Invalid feedback.'};
 try {
 await throttle(`feedback:${user.id}`,60);
 const rows=await ownedQuery(user.id,`insert into message_feedback(message_id,user_id,rating,detail)
 select id,$2,$3,$4 from messages where id=$1 and user_id=$2 and sender='ai'
 on conflict(message_id) do update set rating=excluded.rating,detail=excluded.detail,updated_at=now() returning message_id`,[id,user.id,rating,detail]);
 return {success:!!rows.length};
 } catch {return {success:false,error:'Unable to save feedback.'};}
}
// Editing removes later turns atomically so stale answers cannot remain in the model context.
export async function editConversationMessage(chatId:string,messageId:string,content:string) {
 const user=await currentUser();
 if(!user || !uuid.test(chatId) || !uuid.test(messageId) || typeof content!=='string' || !content.trim() || content.length>32000) return {success:false,error:'Invalid message.'};
 try {
 await transaction(async client=>{
 const {rows:chats}=await client.query('select id from chats where id=$1 and user_id=$2 for update',[chatId,user.id]);
 if(!chats.length) throw new Error('Unavailable');
 const {rows}=await client.query("select created_at::text as created_at from messages where id=$1 and chat_id=$2 and user_id=$3 and sender='user'",[messageId,chatId,user.id]);
 if(!rows.length) throw new Error('Unavailable');
 await client.query('delete from messages where chat_id=$1 and user_id=$2 and (created_at,id)>($3::timestamptz,$4::uuid)',[chatId,user.id,rows[0].created_at,messageId]);
 await client.query('update messages set content=$1 where id=$2 and user_id=$3',[content.trim(),messageId,user.id]);
 await client.query('update chats set updated_at=now() where id=$1',[chatId]);
 });
 return {success:true};
 } catch {return {success:false,error:'Unable to edit message.'};}
}

export async function duplicateConversation(chatId:string,throughMessageId?:string) {
 const user=await currentUser();
 if(!user || !uuid.test(chatId) || (throughMessageId!==undefined && !uuid.test(throughMessageId))) return {success:false,error:'Invalid conversation.'};
 try {
 const id=randomUUID();
 await throttle(`duplicate:${user.id}`,30);
 await transaction(async client=>{
 const {rows}=await client.query('select name,area,model_id,project from chats where id=$1 and user_id=$2 for update',[chatId,user.id]);
 if(!rows.length)throw new Error('Unavailable');
 let boundary:null|{created_at:string;id:string}=null;
 if(throughMessageId){const result=await client.query('select id,created_at::text as created_at from messages where id=$1 and chat_id=$2 and user_id=$3',[throughMessageId,chatId,user.id]);if(!result.rows.length)throw new Error('Unavailable');boundary=result.rows[0];}
 await client.query('insert into chats(id,user_id,name,area,model_id,project) values($1,$2,$3,$4,$5,$6)',[id,user.id,`${throughMessageId?'Branch':'Copy'}: ${rows[0].name||'Untitled'}`.slice(0,200),rows[0].area,rows[0].model_id,rows[0].project]);
 await client.query(`insert into messages(chat_id,user_id,sender,content,model_id,created_at)
 select $1,user_id,sender,content,model_id,created_at from messages where chat_id=$2 and user_id=$3
 and ($4::timestamptz is null or (created_at,id)<=($4::timestamptz,$5::uuid)) order by created_at,id`,[id,chatId,user.id,boundary?.created_at??null,boundary?.id??null]);
 });return {success:true,id};
 } catch{return {success:false,error:'Unable to duplicate conversation.'};}
}
