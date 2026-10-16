'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ArrowUp, ChevronLeft, ChevronRight, CreditCard, FileText, History, LayoutGrid, Plus, Settings, Wallet, UserRound, X } from 'lucide-react';
import {
  getWorkspaceBillingData,
  saveWorkspaceCard,
  setWorkspaceAutoReloadSettings,
  workspaceCreditPurchaseStatus,
} from '@/app/workspace-actions';
import { ConversationTools, exportConversation } from './conversation-tools';
import { MessageContent } from './message-content';
import { getMessagesForChat } from '@/app/actions';
import {
  WORKSPACE_CREDIT_DEFAULT_AMOUNT_CENTS,
  WORKSPACE_CREDIT_MAX_AMOUNT_CENTS,
  WORKSPACE_CREDIT_MIN_AMOUNT_CENTS,
  WORKSPACE_CREDIT_AMOUNT_PRESETS_USD,
  creditsFromAmountCents,
  formatWorkspaceCreditUsd,
} from '@/lib/workspace-credit-limits';

type WorkspaceData =
  | {
      balance: number;
      creditCost: number;
      usage: { id: string; status: string; created_at: string; credits: number }[];
      transactions: { id: string; amount: number; currency: string; credits: number; created_at: string }[];
      card: { card_brand: string | null; card_last4: string | null; card_exp_month: number | null; card_exp_year: number | null } | null;
      autoReload?: {
        enabled: boolean;
        threshold: number;
        hasPaymentMethod: boolean;
        lastError: string | null;
        lastAt: string | null;
      };
    }
  | { error: string };
type WorkspaceMessage = { id?: string; sender: 'user' | 'ai'; content: string };
type WorkspaceImage = { name: string; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'; dataUrl: string };
const supportedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

function readImageDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Unable to read the selected image.'));
    reader.onerror = () => reject(new Error('Unable to read the selected image.'));
    reader.readAsDataURL(file);
  });
}



export function WorkspaceApplication({
  email,
  isAuthenticated,
  publishableKey,
  initialData,
  paymentConfirmed,
}: {
  email: string | null;
  isAuthenticated: boolean;
  publishableKey: string;
  initialData: WorkspaceData;
  paymentConfirmed: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState<WorkspaceData>(initialData);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<WorkspaceMessage[]>([]);
  const [conversationId, setConversationId] = useState('');
  const [historyVersion, setHistoryVersion] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  useEffect(() => {
    let active=true;const saved=new URLSearchParams(window.location.search).get('task');
    if(saved && /^[0-9a-f-]{36}$/i.test(saved) && isAuthenticated){setHistoryLoading(true);void getMessagesForChat(saved).then(items=>{if(active){setMessages(items);setConversationId(saved);}}).catch(()=>{if(active)setError('Unable to reopen task.');}).finally(()=>{if(active)setHistoryLoading(false);});}
    else setConversationId(crypto.randomUUID());
    return()=>{active=false;};
  }, [isAuthenticated]);
  async function openTask(id: string) {
    if(busy) return;
    setHistoryLoading(true);setError('');
    try {const saved=await getMessagesForChat(id);setMessages(saved);setConversationId(id);setPrompt('');setTaskAttachments([]);setTaskImages([]);window.history.replaceState(null,'',`/workspace?task=${id}`);}catch{setError('Unable to reopen task.');}finally{setHistoryLoading(false);}
  }
  const [prompt, setPrompt] = useState('');
  const [taskAttachments,setTaskAttachments]=useState<{name:string;content:string}[]>([]);
  const [taskImages,setTaskImages]=useState<WorkspaceImage[]>([]);
  const [readingFiles,setReadingFiles]=useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const initialAutoReload = !('error' in initialData) ? initialData.autoReload : undefined;
  const [autoReloadEnabled, setAutoReloadEnabled] = useState(Boolean(initialAutoReload?.enabled));
  const [autoReloadThreshold, setAutoReloadThreshold] = useState(initialAutoReload?.threshold ?? 1);
  const [autoReloadBusy, setAutoReloadBusy] = useState(false);
  const [autoReloadAmountUsd, setAutoReloadAmountUsd] = useState('5');

  const [autoReloadLastError, setAutoReloadLastError] = useState(initialAutoReload?.lastError || null);
  const [accessPrompt, setAccessPrompt] = useState<'signin' | 'credits' | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  useEffect(()=>{
    const deleted=(event:Event)=>{if((event as CustomEvent<string>).detail===conversationId){setMessages([]);setPrompt('');setTaskAttachments([]);setTaskImages([]);setConversationId(crypto.randomUUID());window.history.replaceState(null,'','/workspace');}};
    window.addEventListener('conversation-deleted',deleted);return()=>window.removeEventListener('conversation-deleted',deleted);
  },[conversationId]);
  const balance = 'balance' in data ? data.balance : null;
  const transactions = 'transactions' in data ? data.transactions : [];
  const usage = 'usage' in data ? data.usage : [];
  const card = 'card' in data ? data.card : null;
  const autoReload = 'autoReload' in data ? data.autoReload : undefined;

  const refreshData = useCallback(async () => {
    setLoading(true);
    const next = await getWorkspaceBillingData();
    setData(next);
    setLoading(false);
    if ('error' in next) setError(next.error || 'Workspace billing data is temporarily unavailable.');
    else {
      setError('');
      if (next.autoReload) {
        setAutoReloadEnabled(Boolean(next.autoReload.enabled));
        setAutoReloadThreshold(next.autoReload.threshold ?? 1);
        if (next.autoReload.reloadAmountCents) {
          setAutoReloadAmountUsd(String(next.autoReload.reloadAmountCents / 100));
        }
        setAutoReloadLastError(next.autoReload.lastError || null);
      }
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const purchaseId = params.get('purchase');
    const setupIntentId = params.get('setup_intent');
    const billing = params.get('billing');
    let active = true;

    if (paymentConfirmed || billing === 'success') {
      setNotice('Your Workspace credit purchase is complete.');
      void refreshData();
    } else if (billing === 'card_saved') {
      setNotice('Workspace payment method saved.');
      void refreshData();
    } else if (billing === 'cancelled') {
      setNotice('Checkout was cancelled. Your Workspace credits were not changed.');
    } else if (billing === 'failed') {
      setError('Payment did not complete. No credits were added.');
    }

    if (purchaseId) {
      void workspaceCreditPurchaseStatus(purchaseId)
        .then((result) => {
          if (!active) return;
          if (result?.error) setError(result.error);
          else {
            setError('');
            setNotice(result?.status === 'succeeded' ? 'Your Workspace credit purchase is complete.' : result?.status === 'pending' ? 'Payment is still processing. Credits will appear after confirmation.' : 'Credit purchase did not complete.');
            void refreshData();
          }
        })
        .catch((failure: unknown) => {
          if (active) setError(failure instanceof Error ? failure.message : 'Unable to confirm the credit purchase.');
        });
    }

    if (setupIntentId) {
      setNotice('Verifying your Workspace payment method…');
      void saveWorkspaceCard(setupIntentId)
        .then((result) => {
          if (!active) return;
          if (result.error) setError(result.error);
          else {
            setError('');
            setNotice('Workspace payment method saved.');
            void refreshData();
          }
        })
        .catch((failure: unknown) => {
          if (active) setError(failure instanceof Error ? failure.message : 'Unable to verify the saved payment method.');
        });
    }

    if (purchaseId || setupIntentId || billing) {
      const next = new URLSearchParams(params);
      // Keep task id if present; drop payment return params after handling.
      next.delete('purchase');
      next.delete('setup_intent');
      next.delete('setup_intent_client_secret');
      next.delete('billing');
      next.delete('payment_intent');
      next.delete('payment_intent_client_secret');
      next.delete('redirect_status');
      const query = next.toString();
      router.replace(query ? `/workspace?${query}` : '/workspace', { scroll: false });
    }

    return () => { active = false; };
  }, [paymentConfirmed, refreshData, router]);

  useEffect(() => {
    const syncSidebarToViewport = () => {
      const isSmallScreen = window.matchMedia('(max-width: 720px)').matches;
      setIsSidebarCollapsed(isSmallScreen);
      setIsMobileSidebarOpen(false);
    };
    syncSidebarToViewport();
    window.addEventListener('resize', syncSidebarToViewport);
    return () => window.removeEventListener('resize', syncSidebarToViewport);
  }, []);

  async function sendTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = [prompt.trim(),...taskAttachments.map(file=>`Attached file: ${file.name}\n${file.content}`),...taskImages.map(image=>`Attached image: ${image.name}`)].filter(Boolean).join('\n\n');
    if(text.length>24000){setError('Keep your prompt and attached text below 24,000 characters.');return;}
    if (!text || busy || historyLoading || !conversationId || readingFiles) return;
    if (!isAuthenticated) {
      setAccessPrompt('signin');
      return;
    }
    if (balance !== null && 'creditCost' in data && balance < data.creditCost) {
      setAccessPrompt('credits');
      return;
    }
    const optimistic = [...messages, { sender: 'user' as const, content: text }].slice(-19);
    const requestMessages = optimistic.map((message) => ({ ...message, content: message.content.slice(0, 32000) }));
    while (requestMessages.length > 1 && requestMessages.reduce((total, message) => total + message.content.length, 0) > 100000) {
      requestMessages.shift();
    }
    setMessages(optimistic);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: requestMessages,
          conversationId,
          images: taskImages.map(({ mimeType, dataUrl }) => ({
            mimeType,
            data: dataUrl.slice(dataUrl.indexOf(',') + 1),
          })),
        }),
      });
      const result = await response.json() as { answer?: string; answerId?: string; userMessageId?: string; balance?: number; error?: string };
      if (!response.ok) throw new Error(result.error || 'Unable to complete this Workspace task.');
      const answer = result.answer;
      const nextBalance = result.balance;
      if (typeof answer !== 'string' || typeof nextBalance !== 'number') throw new Error('The Workspace returned an invalid response.');
      setMessages([...optimistic.slice(0,-1),{...optimistic.at(-1)!,id:result.userMessageId}, { id:result.answerId, sender: 'ai', content: answer }]);
      setHistoryVersion(v=>v+1);
      window.history.replaceState(null,'',`/workspace?task=${conversationId}`);
      setPrompt('');setTaskAttachments([]);setTaskImages([]);
      setData((previous) => 'balance' in previous ? { ...previous, balance: nextBalance } : previous);
      void refreshData();
    } catch (failure) {
      setMessages(messages);
      const message = failure instanceof Error ? failure.message : 'Unable to complete this Workspace task.';
      if (message.includes('Not enough Workspace credits')) {
        setAccessPrompt('credits');
        setError('');
        setNotice('');
      } else if (message.includes('Please sign in')) {
        setAccessPrompt('signin');
        setError('');
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  function beginPurchase() {
    if (!isAuthenticated) {
      setAccessPrompt('signin');
      return;
    }
    setError('');
    setNotice('');
    location.assign('/checkout/credits');
  }

  function beginCardSetup() {
    if (!isAuthenticated) {
      setAccessPrompt('signin');
      return;
    }
    setError('');
    setNotice('');
    location.assign('/checkout/card');
  }

  const dateTime = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const toggleSidebar = () => {
    if (window.matchMedia('(max-width: 720px)').matches) setIsMobileSidebarOpen((open) => !open);
    else setIsSidebarCollapsed((collapsed) => !collapsed);
  };

  return (
    <div className={`workspace-app${isSidebarCollapsed ? ' is-sidebar-collapsed' : ''}${isMobileSidebarOpen ? ' is-mobile-sidebar-open' : ''}`}>
      {isMobileSidebarOpen && <button className="workspace-sidebar-backdrop" type="button" aria-label="Close Workspace navigation" onClick={() => setIsMobileSidebarOpen(false)} />}
      <aside className={`workspace-sidebar${isSidebarCollapsed ? ' is-collapsed' : ''}${isMobileSidebarOpen ? ' is-mobile-expanded' : ''}`} aria-label="Workspace navigation">
        <div className="workspace-brand-row">
          <Link className="workspace-brand" href="/" aria-label="One Fin Solution homepage">
            <Image className="workspace-brand-mark" src="/logo/one-fin-logo.png" alt="" width={44} height={44} />
            <span>One Fin <small>WORKSPACE</small></span>
          </Link>
          <button className="workspace-sidebar-toggle" type="button" onClick={toggleSidebar} aria-label={isMobileSidebarOpen ? 'Close Workspace navigation' : isSidebarCollapsed ? 'Expand Workspace navigation' : 'Collapse Workspace navigation'} title={isMobileSidebarOpen ? 'Close navigation' : isSidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}>
            {isMobileSidebarOpen ? <ChevronLeft size={18} /> : isSidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
        <p className="workspace-sidebar-label">WORKSPACE</p>
        <a className="workspace-side-link is-active" href="#workspace-home" aria-label="Overview" title="Overview"><LayoutGrid size={18} /><span>Overview</span></a>
        <a className="workspace-side-link" href="#workspace-credits" aria-label="Credits and usage" title="Credits and usage"><Wallet size={18} /><span>Credits &amp; usage</span></a>
        <a className="workspace-side-link" href="#workspace-payments" aria-label="Payment settings" title="Payment settings"><CreditCard size={18} /><span>Payment settings</span></a>
        <a className="workspace-side-link" href="#workspace-transactions" aria-label="Transactions" title="Transactions"><History size={18} /><span>Transactions</span></a>
        <a className="workspace-side-link" href="#workspace-activity" aria-label="Activity" title="Activity"><FileText size={18} /><span>Activity</span></a>
        <div className="workspace-sidebar-spacer" />
        <Link className="workspace-side-link" href={isAuthenticated ? '/account' : '/sign-in?next=%2Fworkspace'} aria-label="Account settings" title="Account settings"><Settings size={18} /><span>Account settings</span></Link>
        {isAuthenticated && email
          ? <div className="workspace-user">
              <span className="workspace-user-avatar" aria-hidden="true"><UserRound size={18} /></span>
              <span className="workspace-user-copy"><strong>{email}</strong><small>Workspace account</small></span>
            </div>
          : <Link className="workspace-side-link" href="/sign-in?next=%2Fworkspace" aria-label="Sign in to Workspace" title="Sign in to Workspace"><UserRound size={18} /><span>Sign in to your Workspace</span></Link>}
      </aside>

      <main className="workspace-main" id="workspace-home">
        <header className="workspace-topbar">
          <div><span className="workspace-breadcrumb">One Fin /</span> Workspace</div>
          <div className="workspace-top-actions">
            {isAuthenticated && <Link href="/dashboard/billing">Subscription billing</Link>}
            <span className="workspace-mode-badge">Credit balance · {loading ? '…' : balance ?? (isAuthenticated ? 'Unavailable' : 'Sign in required')}</span>
          </div>
        </header>

        <div className="workspace-content">
          <section className="workspace-welcome">
            <div>
              <p className="workspace-eyebrow">YOUR WORKSPACE</p>
              <h1>Build something useful.</h1>
              <p>Work through a task with One Fin AI. Completed tasks use credits from your Workspace balance.</p>
            </div>
            <button className="workspace-secondary-button" type="button" disabled={busy || historyLoading} onClick={() => { setConversationId(crypto.randomUUID());setMessages([]);setPrompt('');setTaskAttachments([]);setTaskImages([]);setError('');setNotice('');window.history.replaceState(null,'','/workspace'); }}>
              <Plus size={16} /> New task
            </button>
          </section>

          {(error || notice) && (
            <div className={error ? 'workspace-alert' : 'workspace-notice'} role={error ? 'alert' : 'status'}>
              {error || notice}
            </div>
          )}

          <section className="workspace-metrics" id="workspace-credits" aria-label="Workspace credits">
            <article className="workspace-metric-card workspace-balance-card">
              <span className="workspace-metric-label">AVAILABLE WORKSPACE CREDITS</span>
              <strong>{loading ? '…' : balance ?? (isAuthenticated ? '—' : 'Sign in')}</strong>
              <span className="workspace-muted-copy">{'creditCost' in data ? `${data.creditCost} credit${data.creditCost === 1 ? '' : 's'} used when a task completes successfully.` : isAuthenticated ? 'Credit pricing is temporarily unavailable.' : 'Sign in to view your balance and Workspace credit usage.'}</span>
              <button className="workspace-primary-button" type="button" onClick={() => void beginPurchase()} disabled={isAuthenticated && !publishableKey}>
                <Plus size={16} /> {isAuthenticated ? 'Add credits · $5' : 'Sign in to add credits'}
              </button>
              {isAuthenticated && !publishableKey && <span className="workspace-muted-copy">Credit checkout is not configured yet.</span>}
            </article>
            <article className="workspace-metric-card">
              <span className="workspace-metric-label">COMPLETED TASKS</span>
              <strong>{loading ? '…' : usage.filter((item) => item.status === 'completed').length}</strong>
              <span className="workspace-muted-copy">Your recent credit-consuming operations.</span>
            </article>
            <article className="workspace-metric-card" id="workspace-payments">
              <span className="workspace-metric-label">PAYMENT METHOD</span>
              <strong className="workspace-card-value">{card?.card_last4 ? `•••• ${card.card_last4}` : isAuthenticated ? 'Not added' : 'Sign in required'}</strong>
              <span className="workspace-muted-copy">{card?.card_brand ? `${card.card_brand} · Expires ${card.card_exp_month}/${card.card_exp_year}` : 'Cards are used only for one-time Workspace purchases.'}</span>
              <button className="workspace-link-button" type="button" onClick={() => void beginCardSetup()} disabled={isAuthenticated && !publishableKey}>Manage payment method</button>
            </article>
          </section>

          {isAuthenticated && <section className="workspace-panel"><h2>Saved tasks and projects</h2><ConversationTools area="workspace" onOpen={id=>void openTask(id)} refreshKey={historyVersion}/></section>}
          <section className="workspace-panel workspace-task-panel" aria-label="Workspace AI task">
            <div className="workspace-panel-heading">
              <div><p className="workspace-eyebrow">TASK STUDIO</p><h2>What are you working on?</h2></div>
              <span className="workspace-task-cost">{'creditCost' in data ? data.creditCost : '—'} credit{'creditCost' in data && data.creditCost === 1 ? '' : 's'} per completed response</span>
            </div>
            <div className="conversation-toolbar"><button type="button" disabled={!messages.length || busy} onClick={()=>exportConversation(messages)}>Export Markdown</button><button type="button" disabled={!messages.length || busy} onClick={()=>exportConversation(messages,'json')}>Export JSON</button></div>
            {historyLoading && <p role="status">Loading saved task?</p>}
            {messages.length > 0 && (
              <div className="workspace-task-messages" role="log" aria-live="polite">
                {messages.map((message, index) => (
                  <article key={`${index}-${message.sender}`} className={`workspace-task-message is-${message.sender}`}>
                    <strong>{message.sender === 'user' ? 'You' : 'One Fin AI'}</strong><MessageContent content={message.content}/><button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(message.content);setNotice('Message copied.');}catch{setError('Unable to copy message.');}}}>Copy</button>
                  </article>
                ))}
                {busy && <p className="workspace-task-pending" role="status">Working on your task…</p>}
              </div>
            )}
            <div className="conversation-toolbar"><label>Attach images, text, Markdown, CSV or code<input type="file" multiple disabled={busy || readingFiles || historyLoading} accept="image/jpeg,image/png,image/webp,image/gif,.txt,.md,.csv,.json,.js,.ts,.tsx,.py,.sql,.css,.html,.yaml,.yml" onChange={async event=>{
              const files=Array.from(event.target.files||[]);event.target.value='';setReadingFiles(true);setError('');
              try{const additions:{name:string;content:string}[]=[];const imageAdditions:WorkspaceImage[]=[];let total=taskAttachments.reduce((n,file)=>n+file.content.length,0);
                if(files.length+taskAttachments.length+taskImages.length>5)throw new Error('Attach up to five files or images per task.');
                let imageCount=taskImages.length;let imageBytes=taskImages.reduce((sum,image)=>sum+Math.floor((image.dataUrl.length-image.dataUrl.indexOf(',')-1)*3/4),0);
                for(const file of files){
                  if(file.type.startsWith('image/')){
                    if(!supportedImageTypes.includes(file.type as typeof supportedImageTypes[number])||file.size>2*1024*1024||imageCount>=3||imageBytes+file.size>3.5*1024*1024)throw new Error('Use up to three PNG, JPEG, WebP, or GIF images, 2 MB each and 3.5 MB total.');
                    imageAdditions.push({name:file.name,mimeType:file.type as WorkspaceImage['mimeType'],dataUrl:await readImageDataUrl(file)});imageCount++;imageBytes+=file.size;continue;
                  }
                  if(!/\.(txt|md|csv|json|js|ts|tsx|py|sql|css|html|yaml|yml)$/i.test(file.name)||file.size>100000)throw new Error('Use supported text files of 100 KB or smaller. PDFs and other binary documents are not supported yet.');
                  const content=await file.text();if(content.includes('\u0000'))throw new Error('Binary files are not supported.');total+=content.length;if(total>20000)throw new Error('Attached text must be under 20,000 characters.');additions.push({name:file.name,content});
                }
                setTaskAttachments(previous=>[...previous,...additions]);setTaskImages(previous=>[...previous,...imageAdditions]);
              }catch(failure){setError(failure instanceof Error?failure.message:'Unable to read files.');}finally{setReadingFiles(false);}
            }}/></label>{readingFiles&&<span role="status">Reading files…</span>}{taskAttachments.map((file,index)=><button type="button" key={index} disabled={busy} onClick={()=>setTaskAttachments(items=>items.filter((_,i)=>i!==index))} aria-label={`Remove ${file.name}`}>{file.name}</button>)}</div>
            {taskImages.length>0&&<div className="workspace-image-attachments" aria-label="Attached images">{taskImages.map((image,index)=><span className="workspace-image-attachment" key={`${image.name}-${index}`}><Image src={image.dataUrl} alt={`Preview of ${image.name}`} width={96} height={72} unoptimized/><span>{image.name}</span><button type="button" disabled={busy} onClick={()=>setTaskImages(items=>items.filter((_,i)=>i!==index))} aria-label={`Remove ${image.name}`}><X size={14}/></button></span>)}</div>}
            <form className="workspace-task-form" onSubmit={sendTask}>
              <label className="sr-only" htmlFor="workspace-task-prompt">Describe a Workspace task</label>
              <textarea
                id="workspace-task-prompt"
                rows={4}
                maxLength={4000}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Describe the task you want to work on…"
                disabled={busy || historyLoading}
                onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();event.currentTarget.form?.requestSubmit();}}}
              />
              <div className="workspace-task-form-footer">
                <span>{prompt.length}/4000 characters · Shift + Enter for a new line</span>
                <button className="workspace-primary-button" type="submit" disabled={busy || readingFiles || historyLoading || (!prompt.trim() && !taskAttachments.length && !taskImages.length)}>
                  {busy ? 'Working…' : isAuthenticated ? 'Run task' : 'Sign in to run'} <ArrowUp size={16} />
                </button>
              </div>
            </form>
            {!loading && isAuthenticated && balance === 0 && (
              <div className="workspace-empty-credits">
                <strong>You’re out of Workspace credits.</strong>
                <span>Add a one-time credit pack to continue. Chat subscriptions do not include Workspace credits.</span>
                <button className="workspace-link-button" type="button" onClick={() => setAccessPrompt('credits')}>Add credits</button>
              </div>
            )}
            {!loading && !isAuthenticated && (
              <div className="workspace-empty-credits">
                <strong>Sign in when you’re ready to use Workspace.</strong>
                <span>Your credits, payment methods, transactions, and task history stay with your account.</span>
                <button className="workspace-link-button" type="button" onClick={() => setAccessPrompt('signin')}>Sign in to continue</button>
              </div>
            )}
          </section>

          <section className="workspace-two-panels">
            <article className="workspace-panel" id="workspace-transactions">
              <div className="workspace-panel-heading"><div><p className="workspace-eyebrow">PAYMENTS</p><h2>Credit purchases</h2></div><span className="workspace-muted-copy">One-time purchases only</span></div>
              {transactions.length ? (
                <div className="workspace-table-wrap"><table className="workspace-table"><thead><tr><th>Date</th><th>Credits</th><th>Amount</th><th>Status</th><th>Receipt</th></tr></thead><tbody>
                  {transactions.map((item) => <tr key={item.id}><td>{dateTime(item.created_at)}</td><td>+{item.credits}</td><td>{(item.amount / 100).toLocaleString(undefined, { style: 'currency', currency: item.currency.toUpperCase() })}</td><td><span className="workspace-status-pill">Paid</span></td><td>{(item as { receipt_url?: string | null }).receipt_url ? <a href={(item as { receipt_url?: string }).receipt_url!} target="_blank" rel="noreferrer">View</a> : "—"}</td></tr>)}
                </tbody></table></div>
              ) : <p className="workspace-empty-copy">{isAuthenticated ? 'Completed credit purchases will appear here.' : 'Sign in to view your private Workspace transactions.'}</p>}
              {isAuthenticated && <Link className="workspace-inline-link" href="/dashboard/billing">View subscription billing separately →</Link>}
            </article>
            <article className="workspace-panel" id="workspace-activity">
              <div className="workspace-panel-heading"><div><p className="workspace-eyebrow">USAGE</p><h2>Recent activity</h2></div><span className="workspace-muted-copy">Latest 20 operations</span></div>
              {usage.length ? (
                <ul className="workspace-activity-list">{usage.map((item) => <li key={item.id}><span><strong>Workspace AI task</strong><small>{dateTime(item.created_at)}</small></span><span className="workspace-status-pill">{item.status === 'completed' ? `−${item.credits} credit${item.credits === 1 ? '' : 's'}` : item.status}</span></li>)}</ul>
              ) : <p className="workspace-empty-copy">{isAuthenticated ? 'Your completed Workspace tasks will appear here.' : 'Sign in to view private task history.'}</p>}
            </article>
          </section>

          <section className="workspace-panel workspace-reload-panel">
            <div>
              <p className="workspace-eyebrow">CREDIT RELOADS</p>
              <p className="workspace-muted-copy" style={{marginTop:4}}>Uses a Workspace-only card. Subscription cards are never used for credits or auto-reload.</p>
              <h2>{autoReloadEnabled ? 'Automatic reloads are on' : 'Automatic reloads are off'}</h2>
              <p>
                When your balance falls to the threshold, Workspace can charge your saved Workspace card
                off-session for your chosen reload amount (min $5, max $500).
                Subscription cards are never used.
              </p>
              {isAuthenticated ? (
                <div className="workspace-auto-reload-controls" style={{ display: 'grid', gap: 12, marginTop: 16 }}>
                  
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span>Reload amount (USD) — min $5, max $500</span>
                    <input
                      type="number"
                      min={WORKSPACE_CREDIT_MIN_AMOUNT_CENTS / 100}
                      max={WORKSPACE_CREDIT_MAX_AMOUNT_CENTS / 100}
                      step="1"
                      value={autoReloadAmountUsd}
                      disabled={autoReloadBusy}
                      onChange={(event) => setAutoReloadAmountUsd(event.target.value)}
                    />
                    <span className="muted">
                      {(() => {
                        const cents = Math.round(Number(autoReloadAmountUsd) * 100);
                        if (
                          !Number.isFinite(cents) ||
                          cents < WORKSPACE_CREDIT_MIN_AMOUNT_CENTS ||
                          cents > WORKSPACE_CREDIT_MAX_AMOUNT_CENTS
                        ) {
                          return 'Enter $5–$500';
                        }
                        return `${formatWorkspaceCreditUsd(cents)} → ${creditsFromAmountCents(cents).toLocaleString()} credits`;
                      })()}
                    </span>
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {WORKSPACE_CREDIT_AMOUNT_PRESETS_USD.slice(0, 8).map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className="button secondary"
                        disabled={autoReloadBusy}
                        onClick={() => setAutoReloadAmountUsd(String(preset))}
                      >
                        ${preset}
                      </button>
                    ))}
                  </div>
<label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={autoReloadEnabled}
                      disabled={autoReloadBusy || (!card && !autoReloadEnabled)}
                      onChange={(event) => {
                        void (async () => {
                          setAutoReloadBusy(true);
                          setError('');
                          const result = await setWorkspaceAutoReloadSettings({
                            enabled: event.target.checked,
                            threshold: autoReloadThreshold,
                            amountUsd: autoReloadAmountUsd,
                          });
                          setAutoReloadBusy(false);
                          if (result.error) {
                            setError(result.error);
                            return;
                          }
                          if (result.autoReload) {
                            setAutoReloadEnabled(result.autoReload.enabled);
                            setAutoReloadThreshold(result.autoReload.threshold);
                            if (result.autoReload.reloadAmountCents) {
                              setAutoReloadAmountUsd(String(result.autoReload.reloadAmountCents / 100));
                            }
                            setNotice(
                              result.autoReload.enabled
                                ? 'Auto-reload enabled for low Workspace balances.'
                                : 'Auto-reload disabled.',
                            );
                            void refreshData();
                          }
                        })();
                      }}
                    />
                    <span>Enable low-balance auto-reload</span>
                  </label>
                  <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span>Threshold</span>
                    <input
                      type="number"
                      min={0}
                      max={1000000}
                      value={autoReloadThreshold}
                      disabled={autoReloadBusy}
                      onChange={(event) =>
                        setAutoReloadThreshold(Math.max(0, Math.floor(Number(event.target.value) || 0)))
                      }
                      onBlur={() => {
                        void (async () => {
                          setAutoReloadBusy(true);
                          const result = await setWorkspaceAutoReloadSettings({
                            enabled: autoReloadEnabled,
                            threshold: autoReloadThreshold,
                            amountUsd: autoReloadAmountUsd,
                          });
                          setAutoReloadBusy(false);
                          if (result.error) setError(result.error);
                          else if (result.autoReload) {
                            setAutoReloadEnabled(result.autoReload.enabled);
                            setAutoReloadThreshold(result.autoReload.threshold);
                            if (result.autoReload.reloadAmountCents) {
                              setAutoReloadAmountUsd(String(result.autoReload.reloadAmountCents / 100));
                            }
                          }
                        })();
                      }}
                      style={{ width: 88 }}
                    />
                    <span className="workspace-muted-copy">credits remaining</span>
                  </label>
                  {!card ? (
                    <p className="workspace-empty-copy">Save a Workspace card before enabling auto-reload.</p>
                  ) : null}
                  {autoReloadLastError ? (
                    <p className="workspace-empty-copy">Last auto-reload issue: {autoReloadLastError}</p>
                  ) : null}
                </div>
              ) : (
                <p className="workspace-empty-copy">Sign in to manage automatic credit reloads.</p>
              )}
            </div>
            <span className="workspace-status-pill">{autoReloadEnabled ? 'Enabled' : 'Not enabled'}</span>
          </section>
        </div>
      </main>
      {accessPrompt && (
        <div className="workspace-access-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setAccessPrompt(null); }}>
          <section className="workspace-access-dialog" role="dialog" aria-modal="true" aria-labelledby="workspace-access-title">
            <button className="workspace-access-close" type="button" aria-label="Close dialog" onClick={() => setAccessPrompt(null)}>×</button>
            {accessPrompt === 'signin' ? (
              <>
                <p className="workspace-eyebrow">WORKSPACE ACCESS</p>
                <h2 id="workspace-access-title">Sign in to continue</h2>
                <p>Sign in to verify your Workspace credits and start using credit-based tools. A homepage chat subscription does not include Workspace credits.</p>
                <div className="workspace-access-actions">
                  <Link className="workspace-primary-button" href="/sign-in?next=%2Fworkspace">Sign in</Link>
                  <Link className="workspace-link-button" href="/sign-up">Create account</Link>
                </div>
              </>
            ) : (
              <>
                <p className="workspace-eyebrow">WORKSPACE CREDITS</p>
                <h2 id="workspace-access-title">Add credits to continue</h2>
                <p>You need more Workspace credits to run this task. Add a one-time credit pack; it does not start a chat subscription.</p>
                <div className="workspace-access-actions">
                  <button className="workspace-primary-button" type="button" disabled={!publishableKey} onClick={() => { setAccessPrompt(null); void beginPurchase(); }}>
                    <Plus size={16} /> Add credits · $5
                  </button>
                  {!publishableKey && <span className="workspace-muted-copy">Credit checkout is not configured yet.</span>}
                  <button className="workspace-link-button" type="button" onClick={() => setAccessPrompt(null)}>Not now</button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
