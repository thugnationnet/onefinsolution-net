'use client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { toast } from 'sonner';

export function MessageContent({content}:{content:string}) {
 return <div className="message-markdown"><ReactMarkdown remarkPlugins={[remarkGfm,remarkMath]} rehypePlugins={[rehypeKatex,rehypeHighlight]} components={{
 a:({children,...props})=><a {...props} target="_blank" rel="noopener noreferrer">{children}</a>,
 pre:({children})=><div className="message-code"><button type="button" onClick={async event=>{
 const text=event.currentTarget.parentElement?.querySelector('code')?.textContent || '';
 try {await navigator.clipboard.writeText(text);toast.success('Code copied');} catch {toast.error('Unable to copy code.');}
 }}>Copy code</button><pre>{children}</pre></div>,
 // Remote images are links: private chat views never automatically contact an arbitrary image host.
 img:({src,alt})=>typeof src==='string'?<a href={src} target="_blank" rel="noopener noreferrer">{alt||'View image'}</a>:null,
 }}>{content}</ReactMarkdown></div>;
}
