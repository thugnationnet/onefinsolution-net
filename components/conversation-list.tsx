'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteChat } from '@/app/actions';
export function ConversationList({chats}:{chats:{id:string;name:string;updated:string}[]}) {
  const [search,setSearch]=useState(''),[confirm,setConfirm]=useState<string|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const router=useRouter();
  async function remove(id:string) {setBusy(true);setError('');try {const result=await deleteChat(id);if(!result.success) throw new Error();setConfirm(null);router.refresh();}catch {setError('Unable to delete this conversation. Please try again.');}finally{setBusy(false);}}
  const visible=chats.filter(chat=>(chat.name||'Untitled conversation').toLowerCase().includes(search.toLowerCase()));
  return <><label className="field">Search conversations<input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Find a conversation…" /></label>{error&&<p role="alert" className="notice error">{error}</p>}<ul className="data-list">{visible.map(chat=><li key={chat.id}><div><Link className="text-link" href={`/c/${chat.id}`}>{chat.name||'Untitled conversation'}</Link><small>{chat.updated}</small></div>{confirm===chat.id?<div><p className="small-copy">Delete this conversation and its messages?</p><div className="button-row"><button className="button danger small" disabled={busy} onClick={()=>remove(chat.id)}>Delete permanently</button><button className="button secondary small" disabled={busy} onClick={()=>setConfirm(null)}>Keep it</button></div></div>:<button className="button secondary small" onClick={()=>setConfirm(chat.id)}>Delete</button>}</li>)}</ul>{!visible.length&&<p className="empty-state">{chats.length?'No matching conversations.':'No conversations yet. Start a new chat to begin.'}</p>}</>;
}
