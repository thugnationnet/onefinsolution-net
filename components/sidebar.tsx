"use client";

import { ConversationTools } from "./conversation-tools";
import { toast } from "sonner";
import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Settings,
  LogOut,
  LogIn,
  UserPlus,
  User,
  MoreHorizontal,
  Search,
  Blocks,
  BookOpen,
  CircleHelp,
  Info,
} from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import { logoutAction } from "@/app/actions";
import { SettingsModal } from "./settings-modal";
import { DeleteConfirmationModal } from "./delete-confirmation-modal";
import { getChatHistory, deleteChat } from "@/app/actions";
import { Skeleton } from "@/components/ui/skeleton";

interface ChatHistoryItem {
  id: string;
  title: string;
}

function capitalizeFirstLetter(string: string | null): string {
  if (!string) return '';
  return string.charAt(0).toUpperCase() + string.slice(1);
}

export interface SidebarProps {
  className?: string;
  onToggleCollapse?: () => void;
  collapsed?: boolean;
  isAuthenticated: boolean;
  isAuthLoading: boolean;
  activePlanName: string | null;
  activePlanStatus: 'loading' | 'loaded' | 'error';
}

export function SidebarComponent({ className, onToggleCollapse, collapsed = false, isAuthenticated, isAuthLoading, activePlanName, activePlanStatus }: SidebarProps) {
  const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'account' | 'modules' | 'subscriptions'>('account');
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  // --- State for Chat History ---
  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // --- State for Delete Confirmation ---
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [chatToDelete, setChatToDelete] = useState<ChatHistoryItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const profileButton = document.querySelector('.profile-button');
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target as Node) &&
        !(profileButton && profileButton.contains(event.target as Node))
      ) {
        setShowProfileMenu(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // --- useEffect to fetch chat history ---
  useEffect(() => {

    if (isAuthenticated) {
      setIsLoadingHistory(true);
      setHistoryError(null);
      getChatHistory()
        .then(history => {

          setChatHistory(history);
        })
        .catch(error => {
          console.error("Sidebar fetch history error:", error);
          setHistoryError("Failed to load history.");
        })
        .finally(() => {
          setIsLoadingHistory(false);
        });
    } else {

      setChatHistory([]);
      setIsLoadingHistory(false);
    }
  }, [isAuthenticated, pathname]);

  useEffect(()=>{
    if(!isAuthenticated)return;
    let active=true;
    const refresh=()=>{void getChatHistory().then(history=>{if(active)setChatHistory(history);}).catch(()=>{if(active)setHistoryError('Failed to refresh history.');});};
    const deleted=(event:Event)=>{if(pathname===`/c/${(event as CustomEvent<string>).detail}`)router.push('/');};
    window.addEventListener('conversation-history-changed',refresh);window.addEventListener('conversation-deleted',deleted);
    return()=>{active=false;window.removeEventListener('conversation-history-changed',refresh);window.removeEventListener('conversation-deleted',deleted);};
  },[isAuthenticated,pathname,router]);

  const handleCollapseClick = () => {
    if (onToggleCollapse) {
      onToggleCollapse();
    }
  };

  const toggleHistory = () => setIsHistoryCollapsed(!isHistoryCollapsed);

  const handleSignOut = async () => {
    try { await logoutAction(); } catch { toast.error("Unable to sign out. Please try again."); return; }
    router.push('/sign-in');
    router.refresh();
  };

  // --- Define the callback for settings changes ---
  const handleSettingsChanged = () => {
    window.dispatchEvent(new Event('homepage-subscription-updated'));
    router.refresh();
  };

  const handleDeleteChat = async () => {
    if (!chatToDelete || isDeleting) return;

    const deletedChatId = chatToDelete.id;
    setIsDeleting(true);
    setIsDeleteModalOpen(false);

    try {
      const result = await deleteChat(deletedChatId);
      if (result.success) {
        setChatHistory(prevHistory => prevHistory.filter(chat => chat.id !== deletedChatId));

        if (pathname === `/c/${deletedChatId}`) {
          router.push('/');
        }
      } else {
        console.error("Failed to delete chat:", result.error);
        // TODO: Show error toast to user
      }
    } catch (error) {
      console.error("Error calling deleteChat:", error);
      // TODO: Show error toast
    } finally {
      setIsDeleting(false);
      setChatToDelete(null);
    }
  };

  return (
    <div
      className={cn(
        "relative flex flex-col h-full border-r border-stone-200 bg-stone-50 transition-all duration-300 ease-in-out",
        collapsed ? "home-chat-sidebar-collapsed w-[52px]" : "w-[260px]",
        className
      )}
      style={{
        "--sidebar-mask": "linear-gradient(to right, black calc(100% - 80px), transparent calc(100% - 20px))"
      } as React.CSSProperties}
    >
      {collapsed ? (
        <div className="home-chat-sidebar-rail">
          <Button variant="ghost" size="icon" className="sidebar-rail-button" onClick={handleCollapseClick} aria-label="Expand sidebar" title="Expand sidebar"><ChevronRight className="h-4 w-4" /></Button>
          <Link className="sidebar-rail-link sidebar-rail-logo" href="/" aria-label="One Fin home" title="One Fin home">
            <Image className="home-brand-logo" src="/logo/one-fin-logo.png" alt="" width={30} height={30} />
          </Link>
          <Button variant="ghost" size="icon" className="sidebar-rail-button" onClick={() => { setIsHistoryCollapsed(false); setIsSearchOpen(true); handleCollapseClick(); }} aria-label="Search conversations" title="Search conversations"><Search className="h-5 w-5" /></Button>
          <Button variant="ghost" size="icon" className="sidebar-rail-button" onClick={() => router.push('/')} aria-label="New chat" title="New chat"><Plus className="h-5 w-5" /></Button>
          <Link className="sidebar-rail-link" href="/workspace" aria-label="Workspace" title="Workspace"><Blocks className="h-5 w-5" /></Link>
          <Link className="sidebar-rail-link" href="/context" aria-label="Context" title="Context"><BookOpen className="h-5 w-5" /></Link>
          <div className="sidebar-rail-spacer" />
          <div className="relative sidebar-rail-profile">
            <Button variant="ghost" size="icon" className="sidebar-rail-button profile-button" onClick={() => setShowProfileMenu((open) => !open)} aria-label="Open profile menu" aria-expanded={showProfileMenu} title="Profile">
              <User className="h-5 w-5" />
            </Button>
            {showProfileMenu && (
              <div ref={profileMenuRef} className="sidebar-rail-menu" role="region" aria-label="Profile and application menu">
                <div className="px-2 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-blue-200">One Free</div>
                <Link href="/workspace" onClick={() => setShowProfileMenu(false)}><Blocks /><span>Workspace app</span></Link>
                <Link href="/context" onClick={() => setShowProfileMenu(false)}><BookOpen /><span>Context</span></Link>
                <Link href="/account" onClick={() => setShowProfileMenu(false)}><User /><span>Account</span></Link>
                <Link href="/pricing" onClick={() => setShowProfileMenu(false)}><Settings /><span>Plan</span></Link>
                <Link href="/support" onClick={() => setShowProfileMenu(false)}><CircleHelp /><span>Help center</span></Link>
                <Link href="/about" onClick={() => setShowProfileMenu(false)}><Info /><span>About One Fin</span></Link>
                {!isAuthLoading && (isAuthenticated ? (
                  <>
                    <button type="button" onClick={() => { setSettingsTab('account'); setIsSettingsModalOpen(true); setShowProfileMenu(false); }}><Settings /><span>Settings</span></button>
                    <button type="button" onClick={handleSignOut}><LogOut /><span>Sign out</span></button>
                  </>
                ) : (
                  <>
                    <Link href="/sign-up" onClick={() => setShowProfileMenu(false)}><UserPlus /><span>Sign up</span></Link>
                    <Link href="/sign-in" onClick={() => setShowProfileMenu(false)}><LogIn /><span>Sign in</span></Link>
                  </>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between p-4 flex-shrink-0">
            <div className="flex items-center h-[26px]">
              <div className="flex items-center gap-2">
                <Image className="home-brand-logo" src="/logo/one-fin-logo.png" alt="" width={32} height={32} />
                <span className="font-bold text-2xl text-zinc-900 tracking-tight">One Fin</span>
              </div>
            </div>
            {onToggleCollapse && (
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full transition-all duration-300 ease-in-out hover:bg-stone-200"
                onClick={handleCollapseClick}
                aria-label="Collapse sidebar"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="px-3 py-2 flex-shrink-0">
            <Button
              variant="ghost"
              className="w-full text-stone-700 hover:bg-stone-200 px-1.5"
              onClick={() => { setIsSearchOpen((open) => !open); setIsHistoryCollapsed(false); }}
              aria-label="Search conversations"
            >
              <div className="flex items-center gap-2 w-full"><Search className="h-4 w-4" /><span>Search</span></div>
            </Button>
            <Button
              variant="ghost"
              className="w-full text-stone-700 hover:bg-stone-200 px-1.5"
              onClick={() => router.push('/')}
            >
              <div className="flex items-center gap-2 w-full">
                <Plus className="h-4 w-4" />
                <span>New chat</span>
              </div>
            </Button>
          </div>

          <Separator className="bg-stone-200"/>

          <div className="flex-1 overflow-y-auto px-3 py-2">
            <div className="mb-2">
              <button
                className="flex items-center justify-between w-full px-1.5 py-1.5 text-sm font-bold text-stone-700 rounded-md"
                onClick={toggleHistory}
              >
                <span className="text-left">History</span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform text-stone-500",
                    isHistoryCollapsed ? "-rotate-90" : ""
                  )}
                />
              </button>
              {isSearchOpen && !isHistoryCollapsed && (
                <input
                  type="search"
                  value={historySearch}
                  onChange={(event) => setHistorySearch(event.target.value)}
                  placeholder="Search chats"
                  aria-label="Search chat history"
                  className="mb-2 w-full rounded-md border border-stone-200 bg-white px-2 py-1.5 text-sm text-stone-900 outline-none focus:ring-2 focus:ring-blue-300"
                />
              )}
              {!isHistoryCollapsed && (
                <div className="mt-1 space-y-1 animate-in fade-in duration-200 w-full overflow-hidden">
                  {/* Loading State */}
                  {isLoadingHistory && (
                    <>
                      <Skeleton className="h-8 w-full rounded-lg" />
                      <Skeleton className="h-8 w-full rounded-lg" />
                    </>
                  )}
                  {/* Error State */}
                  {!isLoadingHistory && historyError && (
                     <p className="px-1.5 py-2 text-sm text-red-600">{historyError}</p>
                  )}
                  {/* Empty State */}
                  {!isLoadingHistory && !historyError && chatHistory.length === 0 && (
                    <p className="px-1.5 py-2 text-sm text-stone-500">No chat history yet.</p>
                  )}
                  {!isLoadingHistory && !historyError && chatHistory.length > 0 && !chatHistory.some((chat) => chat.title.toLowerCase().includes(historySearch.toLowerCase())) && historySearch && (
                    <p className="px-1.5 py-2 text-sm text-stone-500">No matching conversations.</p>
                  )}
                  {/* History List */}
                  {!isLoadingHistory && !historyError && chatHistory.filter((chat) => chat.title.toLowerCase().includes(historySearch.toLowerCase())).map((chat) => (
                    <div
                      key={chat.id}
                      className="group relative flex items-center w-full overflow-hidden min-w-0"
                    >
                      <Button
                         variant="ghost"
                         className="justify-start text-stone-700 hover:bg-stone-200 text-sm px-1.5 py-2 h-auto flex-grow mr-1 min-w-0"
                         onClick={() => router.push(`/c/${chat.id}`)}
                         disabled={isDeleting && chatToDelete?.id === chat.id}
                      >
                        <div className="relative grow overflow-hidden whitespace-nowrap text-left min-w-0" style={{ maskImage: "var(--sidebar-mask)" }}>
                          {isDeleting && chatToDelete?.id === chat.id ? 'Deleting...' : chat.title}
                        </div>
                      </Button>
                      {/* Three Dot Menu Button - Opens Modal */}
                       <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 p-0 flex-shrink-0 text-stone-500 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            setChatToDelete(chat);
                            setIsDeleteModalOpen(true);
                          }}
                          disabled={isDeleting && chatToDelete?.id === chat.id}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {!collapsed && isAuthenticated && <details className="px-3 overflow-y-auto max-h-72"><summary>Manage chats and projects</summary><ConversationTools area="chat" onOpen={id=>router.push(`/c/${id}`)}/></details>}
          {/* Profile Section (Moved here) */}
           <div className="p-3 border-t border-stone-200">
             <div className="relative">
               <button
                 type="button"
                 className="w-full h-10 bg-stone-50 text-stone-900 hover:bg-stone-200 rounded-lg flex items-center px-4 shadow-none profile-button"
                 aria-expanded={showProfileMenu}
                 aria-controls="profile-navigation-menu"
                 onClick={(e) => {
                   e.stopPropagation();
                   setShowProfileMenu((open) => !open);
                 }}
               >
                 <div className="flex items-center gap-2 grow">
                   <User className="h-4 w-4 flex-shrink-0" />
                   <span>{isAuthLoading ? 'Account' : isAuthenticated ? 'Profile' : 'Welcome'}</span>
                   {!isAuthLoading && isAuthenticated && (
                     <span className="text-xs px-1.5 py-0.5 bg-stone-100 text-stone-500 rounded-full">
                       {activePlanName
                         ? capitalizeFirstLetter(activePlanName)
                         : activePlanStatus === 'loading'
                           ? 'Loading…'
                           : activePlanStatus === 'error'
                             ? 'Unavailable'
                             : 'Free'}
                     </span>
                   )}
                 </div>
                 <ChevronDown className={cn(
                   "h-4 w-4 transition-transform flex-shrink-0 ml-2",
                   showProfileMenu ? "rotate-180" : ""
                 )} />
               </button>

               {showProfileMenu && (
                 <div
                   ref={profileMenuRef}
                   className="absolute bottom-full left-0 z-40 w-full max-h-[calc(100dvh-150px)] overflow-y-auto bg-white rounded-lg shadow-lg border border-stone-200 py-1 mb-1"
                   id="profile-navigation-menu"
                   role="region"
                   aria-label="Profile and application menu"
                 >
                   <div className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-stone-500">One Free</div>
                   <Link className="flex w-full items-center gap-3 px-4 py-2 text-sm text-stone-700 hover:bg-stone-100" href="/workspace" onClick={() => setShowProfileMenu(false)}>
                     <Blocks className="h-4 w-4" /><span>Workspace app</span>
                   </Link>
                   <Link className="flex w-full items-center gap-3 px-4 py-2 text-sm text-stone-700 hover:bg-stone-100" href="/context" onClick={() => setShowProfileMenu(false)}>
                     <BookOpen className="h-4 w-4" /><span>Context</span>
                   </Link>
                   <Link className="flex w-full items-center gap-3 px-4 py-2 text-sm text-stone-700 hover:bg-stone-100" href="/account" onClick={() => setShowProfileMenu(false)}>
                     <User className="h-4 w-4" /><span>Account</span>
                   </Link>
                   <Link className="flex w-full items-center gap-3 px-4 py-2 text-sm text-stone-700 hover:bg-stone-100" href="/pricing" onClick={() => setShowProfileMenu(false)}>
                     <Settings className="h-4 w-4" /><span>Plan</span>
                   </Link>
                   <Link className="flex w-full items-center gap-3 px-4 py-2 text-sm text-stone-700 hover:bg-stone-100" href="/support" onClick={() => setShowProfileMenu(false)}>
                     <CircleHelp className="h-4 w-4" /><span>Help center</span>
                   </Link>
                   <Link className="flex w-full items-center gap-3 px-4 py-2 text-sm text-stone-700 hover:bg-stone-100" href="/about" onClick={() => setShowProfileMenu(false)}>
                     <Info className="h-4 w-4" /><span>Company information</span>
                   </Link>
                   <Separator className="my-1" />
                   {isAuthLoading ? null : isAuthenticated ? (
                     <>
                   <button
                     type="button"
                     className="w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-stone-100 text-stone-700"
                     onClick={() => {
                       setSettingsTab('account');
                       setIsSettingsModalOpen(true);
                       setShowProfileMenu(false);
                     }}
                   >
                     <Settings className="h-4 w-4" />
                     <span>Settings</span>
                   </button>
                   <Separator className="my-1" />
                   <button
                     type="button"
                     className="w-full px-4 py-2 text-left flex items-center gap-3 hover:bg-stone-100 text-red-600"
                     onClick={handleSignOut}
                   >
                     <LogOut className="h-4 w-4" />
                     <span>Sign out</span>
                   </button>
                     </>
                   ) : (
                     <div className="grid grid-cols-2 gap-2 p-2">
                       <Link className="flex items-center justify-center gap-2 rounded-md border border-stone-200 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100" href="/sign-up" onClick={() => setShowProfileMenu(false)}>
                         <UserPlus className="h-4 w-4" /><span>Sign up</span>
                       </Link>
                       <Link className="flex items-center justify-center gap-2 rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800" href="/sign-in" onClick={() => setShowProfileMenu(false)}>
                         <LogIn className="h-4 w-4" /><span>Sign in</span>
                       </Link>
                     </div>
                   )}
                 </div>
               )}
             </div>
           </div>
        </>
      )}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        setIsOpen={setIsSettingsModalOpen}
        onSettingsChanged={handleSettingsChanged}
        initialTab={settingsTab}
      />
      <DeleteConfirmationModal
        isOpen={isDeleteModalOpen}
        setIsOpen={setIsDeleteModalOpen}
        itemTitle={chatToDelete?.title ?? null}
        onConfirmDelete={handleDeleteChat}
        isDeleting={isDeleting}
      />
    </div>
  );
}
