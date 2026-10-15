'use client';
import {useEffect,useState,useCallback} from 'react';
import {searchConversations,organizeConversation,duplicateConversation} from '@/app/conversation-actions';
import {deleteChat,updateChatName,getMessagesForChat} from '@/app/actions';
import {toast} from 'sonner';

export function exportConversation(messages:{sender:string;content:string}[],format:'md'|'json'='md') {
 const text=format==='json'?JSON.stringify(messages,null,2):messages.map(m=>`## ${m.sender==='user'?'You':'One Fin AI'}\n\n${m.content}`).join('\n\n');
 const url=URL.createObjectURL(new Blob([text],{type:format==='json'?'application/json':'text/markdown'}));
 const link=document.createElement('a');link.href=url;link.download=`conversation.${format}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export function ConversationTools({area,onOpen,refreshKey=0}:{area:'chat'|'workspace';onOpen:(id:string)=>void;refreshKey?:number}) {
 const [search,setSearch]=useState('');const [archived,setArchived]=useState(false);
 const [items,setItems]=useState<Awaited<ReturnType<typeof searchConversations>>>([]);
 const [error,setError]=useState('');const [loading,setLoading]=useState(true);const [working,setWorking]=useState(false);
 const [project,setProject]=useState('');
 const reload=useCallback(async()=>{setLoading(true);try {setItems(await searchConversations(area,search,archived));setError('');} catch {setError('Unable to load conversations.');}finally {setLoading(false);}},[area,search,archived]);
 useEffect(()=>{let active=true;const timer=setTimeout(async()=>{
 try {const results=await searchConversations(area,search,archived);if(active){setItems(results);setError('');}}
 catch {if(active)setError('Unable to load conversations.');}finally {if(active)setLoading(false);}
 },250);return()=>{active=false;clearTimeout(timer);};},[area,search,archived,refreshKey]);
 async function action(work:()=>Promise<{success:boolean;error?:string}>) {setWorking(true);try {const result=await work();if(!result.success)throw new Error(result.error||'Unable to update conversation.');await reload();window.dispatchEvent(new Event('conversation-history-changed'));}catch(e){toast.error(e instanceof Error?e.message:'Unable to update conversation.');}finally{setWorking(false);}}
 return <section role="region" className="conversation-tools" aria-label={`${area} conversations`}>
 <input type="search" aria-label="Search titles, projects and messages" placeholder="Search titles and messages" value={search} onChange={e=>setSearch(e.target.value)}/>
 <label><input type="checkbox" checked={archived} onChange={e=>setArchived(e.target.checked)}/> Archived</label>
 <select aria-label="Filter by project" value={project} onChange={e=>setProject(e.target.value)}><option value="">All projects</option>{Array.from(new Set(items.map(i=>i.project).filter(Boolean))).map(p=><option key={p}>{p}</option>)}</select>
 {loading&&<p role="status">Loading conversations…</p>}{error&&<p role="alert">{error} <button onClick={()=>void reload()}>Retry</button></p>}
 {!loading&&!error&&!items.length&&<p>No conversations found.</p>}
 {items.filter(i=>!project||i.project===project).map(item=><article key={item.id}>
 <button className="conversation-open" disabled={working} onClick={()=>onOpen(item.id)}>{item.pinned?'★ ':''}{item.title}</button>
 <small>{item.project&&`${item.project} · `}{new Date(item.updated_at).toLocaleDateString()}</small>
 <details><summary>Conversation options</summary><div>
 <button disabled={working} onClick={()=>void action(async()=>{const result=await duplicateConversation(item.id);if(result.success && result.id)onOpen(result.id);return result;})}>Duplicate</button>
 <button disabled={working} onClick={()=>{const name=window.prompt('Conversation title',item.title);if(name)void action(()=>updateChatName(item.id,name));}}>Rename</button>
 <button disabled={working} onClick={()=>void action(()=>organizeConversation(item.id,{pinned:!item.pinned}))}>{item.pinned?'Unpin':'Pin'}</button>
 <button disabled={working} onClick={()=>void action(()=>organizeConversation(item.id,{archived:!item.archived}))}>{item.archived?'Restore':'Archive'}</button>
 <button disabled={working} onClick={()=>{const name=window.prompt('Project name (leave empty to remove)',item.project);if(name!==null)void action(()=>organizeConversation(item.id,{project:name}));}}>Move to project</button>
 <button disabled={working} onClick={async()=>{try {exportConversation(await getMessagesForChat(item.id));}catch{toast.error('Unable to export conversation.');}}}>Export Markdown</button>
 <button disabled={working} onClick={()=>{if(window.confirm('Delete this conversation and all its messages?'))void action(async()=>{const result=await deleteChat(item.id);if(result.success)window.dispatchEvent(new CustomEvent('conversation-deleted',{detail:item.id}));return result;});}}>Delete</button>
 </div></details></article>)}
 </section>;
}
