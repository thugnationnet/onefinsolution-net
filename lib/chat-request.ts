import type {AIImage} from './ai';
export interface ChatRequest {messages:{id:string;sender:'user'|'ai';content:string}[];model:string;contextItemId?:string|null;images:AIImage[]}
export function validateChatRequest(value:unknown):value is ChatRequest {
 if(!value || typeof value!=='object')return false;
 const input=value as ChatRequest;
 if(input.model!=='default' || (input.contextItemId!==undefined && input.contextItemId!==null && (typeof input.contextItemId!=='string'||!/^[0-9a-f-]{36}$/i.test(input.contextItemId))))return false;
 if(!Array.isArray(input.messages)||!input.messages.length||input.messages.length>100||input.messages.some(m=>!m||typeof m.content!=='string'||m.content.length>32000||!['user','ai'].includes(m.sender))||input.messages.reduce((n,m)=>n+m.content.length,0)>128000||input.messages.at(-1)?.sender!=='user')return false;
 return Array.isArray(input.images)&&input.images.length<=3&&input.images.every(i=>i&&['image/jpeg','image/png','image/webp','image/gif'].includes(i.mimeType)&&typeof i.data==='string'&&/^[A-Za-z0-9+/]+={0,2}$/.test(i.data))&&input.images.reduce((n,i)=>n+i.data.length,0)<=5000000;
}
