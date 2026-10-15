'use client';

import { readChatStream } from '@/lib/read-chat-stream';
import { duplicateConversation } from '@/app/conversation-actions';
import { useRouter } from 'next/navigation';
import { MessageContent } from './message-content';
import { exportConversation } from './conversation-tools';
import { editConversationMessage, saveMessageFeedback } from '@/app/conversation-actions';
import { availableModels } from '@/lib/models';
import { useWorkspacePreferences } from './workspace-preferences';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { ArrowUp, Bookmark, Check, Clipboard, FileUp, Image as ImageIcon, Link2, Loader2, Mic, PlusIcon, BookText, RotateCcw, Share2, Volume2, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { getUserModelSettings, updateUserSelectedModel, addMessage, addContextItem, getMessagesForChat, updateAssistantMessage } from '@/app/actions';
import { SettingsModal } from './settings-modal';
import { v4 as uuidv4 } from 'uuid';
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { ContextSelectorModal } from "./context-selector-modal";
import { ContextItem } from '@/app/actions';

// Define available models with display names within this component
// TODO: Centralize this definition later if needed
const availableModelsForDisplay = availableModels;

// Helper to find display name from ID
const getDisplayName = (id: string | null): string | null => {
  if (!id) return null;
  const model = availableModelsForDisplay.find(m => m.id === id);
  return model ? model.displayName : id; // Fallback to ID if not found
};

// --- Types ---
interface Message {
  id: string;
  sender: 'user' | 'ai';
  content: string;
  persisted?: boolean;
  images?: { name:string; dataUrl:string }[];
}

type PendingAttachment =
  | { id:string; kind:'file'; name:string; content:string }
  | { id:string; kind:'image'; name:string; mimeType:'image/jpeg'|'image/png'|'image/webp'|'image/gif'; dataUrl:string }
  | { id:string; kind:'link'; name:string; url:string };

interface SpeechRecognitionLike {
  lang:string;
  continuous:boolean;
  interimResults:boolean;
  onresult:((event:{resultIndex:number;results:ArrayLike<{isFinal:boolean;[index:number]:{transcript:string}}>} )=>void)|null;
  onerror:((event:{error:string})=>void)|null;
  onend:(()=>void)|null;
  start:()=>void;
  stop:()=>void;
}

type SpeechRecognitionConstructor = new()=>SpeechRecognitionLike;

interface ChatInterfaceProps {
  chatId: string;
}

export function ChatInterface({ chatId }: ChatInterfaceProps) {
  const router=useRouter();
  const [streamText,setStreamText]=useState('');
  const responseAbort=useRef<AbortController|null>(null);
  const requestAIResponse=useCallback(async(conversation:{id:string;sender:'user'|'ai';content:string}[],model:string,contextItemId?:string|null,images:{mimeType:'image/jpeg'|'image/png'|'image/webp'|'image/gif';data:string}[]=[])=>{
    const controller=new AbortController();responseAbort.current=controller;setStreamText('');
    try {
      const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:conversation,model,contextItemId,images}),signal:controller.signal});
      const text=await readChatStream(response,delta=>setStreamText(previous=>previous+delta));
      return {success:true,response:text,error:undefined};
    }catch(error){return {success:false,response:undefined,error:controller.signal.aborted?'Generation stopped. Retry when ready.':error instanceof Error?error.message:'Unable to generate response.'};}
    finally{if(responseAbort.current===controller)responseAbort.current=null;setStreamText('');}
  },[]);
  useEffect(()=>()=>responseAbort.current?.abort(),[chatId]);
  const preferences = useWorkspacePreferences();
  const [prompt, setPrompt] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionLike|null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- Chat State (Specific to this chat session) ---
  const [messages, setMessages] = useState<Message[]>([]);
  const [isAiResponding, setIsAiResponding] = useState(false);

  // --- Model/Settings State (Copied from IdeInterface for now) ---
  // This might need to be fetched or managed differently in a real app
  // depending on whether settings apply globally or per chat.
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [modelDropdownPosition, setModelDropdownPosition] = useState({ top: 0, left: 0 });
  const [enabledModels, setEnabledModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [hasTriggeredInitialResponse, setHasTriggeredInitialResponse] = useState(false); // Flag to prevent multiple triggers

  // --- State for Context Modal ---
  const [isContextModalOpen, setIsContextModalOpen] = useState(false);

  // --- New State for Attached Context ---
  const [attachedContextItem, setAttachedContextItem] = useState<ContextItem | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [isReadingAttachments, setIsReadingAttachments] = useState(false);
  const [attachmentStatus, setAttachmentStatus] = useState<string|null>(null);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [activeSpeechMessageId, setActiveSpeechMessageId] = useState<string|null>(null);
  const [retryingMessageId, setRetryingMessageId] = useState<string|null>(null);
  const [savedResponseIds, setSavedResponseIds] = useState<string[]>([]);
  const [savingResponseIds, setSavingResponseIds] = useState<string[]>([]);
  const [imageAttachmentsByMessage, setImageAttachmentsByMessage] = useState<Record<string, {mimeType:'image/jpeg'|'image/png'|'image/webp'|'image/gif';data:string}[]>>({});
  const [contextByMessage, setContextByMessage] = useState<Record<string, string>>({});

  // --- Calculate Attachment Count ---
  const attachmentCount = pendingAttachments.length + (attachedContextItem ? 1 : 0);

  // --- Load Models (Copied from IdeInterface for now) ---
  const loadModels = useCallback(async () => {
    setIsLoadingModels(true);
    try {
      const settings = await getUserModelSettings();
      setEnabledModels(settings.enabledModels);
      setSelectedModel(settings.selectedModel);
    } catch (error) {
      console.error("Failed to fetch user model settings:", error);
      setEnabledModels([]);
      setSelectedModel(null);
    } finally {
      setIsLoadingModels(false);
    }
  }, []);

  // --- Combined useEffect for initial loading ---
  useEffect(() => {
    let isMounted = true; // Prevent state updates if component unmounts
    setIsLoadingMessages(true); // Start loading messages
    setMessageError(null);
    setHasTriggeredInitialResponse(false); // Reset flag on chat change
    setAttachedContextItem(null); // Clear attached context on chat change
    setPendingAttachments([]);
    setImageAttachmentsByMessage({});
    setContextByMessage({});
    loadModels(); // Load model settings concurrently

    // Fetch existing messages
    getMessagesForChat(chatId)
      .then(fetchedMessages => {
        if (isMounted) {
            setMessages(fetchedMessages.map(message=>({...message,persisted:true})));
            setIsLoadingMessages(false);


        }
      })
      .catch(error => {
        console.error("Failed to fetch chat messages:", error);
        if (isMounted) {
          setMessageError("Failed to load chat history.");
          setIsLoadingMessages(false);
        }
      });

      return () => { isMounted = false; }; // Cleanup function

  }, [chatId, loadModels]); // Only depend on chatId and loadModels

  // --- Function to trigger the initial AI response ---
  // Renamed from handleInitialPromptFlow
  const triggerInitialResponse = useCallback(async (initialUserMessage: Message, history: Message[] = [initialUserMessage]) => {
      const currentModel = selectedModel;
      if (!currentModel) {
        setMessageError('No AI model selected for initial response.');
        return;
      }

      setIsAiResponding(true);
      if (textareaRef.current) textareaRef.current.disabled = true;

      try {
        // Use the potentially updated currentModel
        const result = await requestAIResponse(history, currentModel, contextByMessage[initialUserMessage.id]||null,imageAttachmentsByMessage[initialUserMessage.id]||[]);

        let aiContent: string;
        let messageToSave: Message | null = null;

        if (result.success && result.response) {
          aiContent = result.response;
          messageToSave = { id: uuidv4(), sender: 'ai', content: aiContent };

          const saved = await addMessage(chatId, 'ai', aiContent, currentModel, messageToSave.id);
          messageToSave.persisted = saved.success;
          if (!saved.success) setAttachmentStatus('Reply generated, but could not be saved. Copy it before refreshing.');

        } else {
          aiContent = `Error: ${result.error || 'Failed to get response from AI.'}`;
          messageToSave = { id: uuidv4(), sender: 'ai', content: aiContent };
          console.error("Initial AI Error:", result.error);
        }
        setMessages(prev => [...prev, messageToSave!]);
      } catch (error) {
        console.error("Error calling getAIResponse (initial flow):", error);
        const errorMsg: Message = { id: uuidv4(), sender: 'ai', content: "An error occurred while processing your request." };
        setMessages(prev => [...prev, errorMsg]);
      } finally {
        // Add a small delay before hiding loading to ensure it renders
        setTimeout(() => {
          setIsAiResponding(false);
          if (textareaRef.current) textareaRef.current.disabled = false;
          textareaRef.current?.focus();
        }, 50); // 50ms delay
      }
  }, [chatId, selectedModel, requestAIResponse, contextByMessage, imageAttachmentsByMessage]); // Dependencies

  // Effect to trigger initial response if messages load BEFORE models
   useEffect(() => {
     if (!isLoadingMessages && !isLoadingModels && !hasTriggeredInitialResponse && messages.length === 1 && messages[0].sender === 'user') {
       setHasTriggeredInitialResponse(true); // Set flag
       triggerInitialResponse(messages[0]);
     }
   }, [isLoadingMessages, isLoadingModels, messages, hasTriggeredInitialResponse, triggerInitialResponse]);

   useEffect(() => () => {
     speechRecognitionRef.current?.stop();
     if ('speechSynthesis' in window) window.speechSynthesis.cancel();
   }, []);

  const handleSettingsChanged = useCallback(() => {
     loadModels();
  }, [loadModels]);

  // ... textarea resize effect ...
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(Math.max(textarea.scrollHeight, 48), 360);
      textarea.style.height = `${newHeight}px`;
    }
  }, [prompt]);

  // ... dropdown close effect ...
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const dropdownElement = document.querySelector('.fixed.bg-white.rounded-md.shadow-lg');
      if (dropdownElement && !dropdownElement.contains(target) && !dropdownRef.current?.contains(target)) {
        setIsModelDropdownOpen(false);
      }
    }
    if (isModelDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isModelDropdownOpen]);

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
  };

  // --- Updated handler to accept ContextItem and store it ---
  const handleAddContext = (item: ContextItem) => {
    setAttachedContextItem(item);
    textareaRef.current?.focus();
  };

  // --- Handler to remove attached context ---
  const handleRemoveContext = () => {
    setAttachedContextItem(null);
    textareaRef.current?.focus();
  };

  const readImageDataUrl = (file:File) => new Promise<string>((resolve,reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Unable to read the selected image.'));
    reader.onerror = () => reject(new Error('Unable to read the selected image.'));
    reader.readAsDataURL(file);
  });

  const addFiles = async (files:File[]) => {
    if(isAiResponding || isReadingAttachments)return;
    if (!files.length) return;
    setIsReadingAttachments(true);
    setAttachmentStatus('Reading selected files…');
    try {
      const additions:PendingAttachment[] = [];
      let textSize = pendingAttachments.reduce((total,item)=>total+(item.kind==='file'?item.content.length:0),0);
      let imageSize = pendingAttachments.reduce((total,item)=>total+(item.kind==='image'?Math.ceil(item.dataUrl.length*3/4):0),0);
      let imageCount = pendingAttachments.filter(item=>item.kind==='image').length;
      for (const file of files) {
        if (file.type.startsWith('image/')) {
          if (!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)) throw new Error(`${file.name}: use a PNG, JPEG, WebP, or GIF image.`);
          if (file.size>2*1024*1024 || imageCount>=3 || imageSize+file.size>3.5*1024*1024) throw new Error('Images must be 2 MB or smaller, with at most 3 images and 3.5 MB total per message.');
          const dataUrl = await readImageDataUrl(file);
          additions.push({id:uuidv4(),kind:'image',name:file.name,mimeType:file.type as 'image/jpeg'|'image/png'|'image/webp'|'image/gif',dataUrl});
          imageCount++;
          imageSize+=file.size;
          continue;
        }
        const extension = file.name.split('.').pop()?.toLowerCase();
        const supportedTextTypes = ['text/plain','text/markdown','text/csv','application/json','application/xml'];
        const supportedTextExtensions = ['txt','md','csv','json','html','htm','xml','css','js','jsx','ts','tsx','py','sql','yaml','yml','toml','sh','go','rs','java','c','cpp','h'];
        if (!supportedTextTypes.includes(file.type) && !supportedTextExtensions.includes(extension||'')) {
          throw new Error(`${file.name}: choose a supported text/code file or an image. PDFs and other binary files are not supported yet.`);
        }
        if (file.size>1024*1024) throw new Error(`${file.name}: text/code files must be 1 MB or smaller.`);
        const content = await file.text();
        if (textSize+content.length>20000) throw new Error('Text attachments are limited to 20,000 characters per message.');
        additions.push({id:uuidv4(),kind:'file',name:file.name,content});
        textSize+=content.length;
      }
      setPendingAttachments(current=>[...current,...additions]);
      setAttachmentStatus(`${additions.length} attachment${additions.length===1?'':'s'} added.`);
    } catch(error) {
      setAttachmentStatus(error instanceof Error?error.message:'Unable to add the selected files.');
    } finally {
      setIsReadingAttachments(false);
    }
  };

  const handleFilesSelected = (event:React.ChangeEvent<HTMLInputElement>) => {const files=Array.from(event.target.files||[]);event.target.value='';void addFiles(files);};

  const handleAddLink = (event:React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const enteredUrl = linkDraft.trim();
      if (enteredUrl.length>2048) throw new Error('Use a link shorter than 2,048 characters.');
      const url = new URL(enteredUrl);
      if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use a public website or map link beginning with http:// or https://, without embedded credentials.');
      setPendingAttachments(current=>[...current,{id:uuidv4(),kind:'link',name:url.hostname,url:url.toString()}]);
      setLinkDraft('');
      setIsLinkDialogOpen(false);
      setAttachmentStatus('Link added as a reference. The page itself will not be fetched automatically.');
    } catch(error) {
      setAttachmentStatus(error instanceof Error && (error.message.startsWith('Use a public') || error.message.startsWith('Use a link'))?error.message:'Enter a valid website or map URL beginning with http:// or https://.');
    }
  };

  const handleToggleMicrophone = () => {
    if (isRecording) {
      speechRecognitionRef.current?.stop();
      return;
    }
    const browserWindow = window as Window & {SpeechRecognition?:SpeechRecognitionConstructor;webkitSpeechRecognition?:SpeechRecognitionConstructor};
    const Recognition = browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setAttachmentStatus('Speech-to-text is not supported in this browser. Try a recent version of Chrome or Edge.');
      return;
    }
    const recognition = new Recognition();
    speechRecognitionRef.current = recognition;
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = event => {
      let transcript = '';
      for (let index=event.resultIndex;index<event.results.length;index++) {
        if (event.results[index].isFinal) transcript += event.results[index][0].transcript;
      }
      if (transcript.trim()) setPrompt(current=>`${current}${current.trim()?' ':''}${transcript.trim()}`);
    };
    recognition.onerror = event => {
      setIsRecording(false);
      setAttachmentStatus(event.error==='not-allowed'?'Allow microphone access in your browser to dictate a message.':'Speech recognition stopped. Please try again.');
    };
    recognition.onend = () => setIsRecording(false);
    try {
      recognition.start();
      setIsRecording(true);
      setAttachmentStatus('Listening… Speak your message, then tap the microphone again to stop.');
    } catch {
      setIsRecording(false);
      setAttachmentStatus('Could not start speech recognition. Check microphone permission and try again.');
    }
  };

  const handleReadAloud = (message:Message) => {
    if (!('speechSynthesis' in window)) {
      setAttachmentStatus('Text-to-speech is not supported in this browser.');
      return;
    }
    if (activeSpeechMessageId===message.id) {
      window.speechSynthesis.cancel();
      setActiveSpeechMessageId(null);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message.content);
    utterance.onend = () => setActiveSpeechMessageId(null);
    utterance.onerror = () => {
      setActiveSpeechMessageId(null);
      setAttachmentStatus('Unable to read this response aloud.');
    };
    setActiveSpeechMessageId(message.id);
    window.speechSynthesis.speak(utterance);
  };

  const handleCopyResponse = async (content:string) => {
    try {
      await navigator.clipboard.writeText(content);
      setAttachmentStatus('Response copied to clipboard.');
    } catch {
      setAttachmentStatus('Clipboard access is unavailable. Select and copy the response manually.');
    }
  };

  const handleShareResponse = async (content:string) => {
    try {
      if (navigator.share) {
        await navigator.share({title:'AI chat response',text:content,url:window.location.href});
        setAttachmentStatus('Response shared.');
      } else {
        await navigator.clipboard.writeText(`${content}\n\n${window.location.href}`);
        setAttachmentStatus('Share is unavailable here; the response and chat link were copied.');
      }
    } catch(error) {
      if (error instanceof Error && error.name==='AbortError') return;
      setAttachmentStatus('Unable to share this response. You can copy it instead.');
    }
  };

  const handleSaveResponse = async (message:Message) => {
    if (savedResponseIds.includes(message.id) || savingResponseIds.includes(message.id)) return false;
    const title = message.content.trim().replace(/\s+/g,' ').slice(0,70) || 'Saved chat response';
    setSavingResponseIds(current=>[...current,message.id]);
    try {
      const result = await addContextItem(`Saved response: ${title}`,message.content);
      setAttachmentStatus(result.success?'Response saved to your Context library.':result.error||'Unable to save this response.');
      if (result.success) setSavedResponseIds(current=>current.includes(message.id)?current:[...current,message.id]);
      return result.success;
    } catch(error) {
      console.error('Unable to save chat response:',error);
      setAttachmentStatus('Unable to save this response. Please try again.');
      return false;
    } finally {
      setSavingResponseIds(current=>current.filter(id=>id!==message.id));
    }
  };

  const handleRetryResponse = async (message:Message) => {
    const messageIndex = messages.findIndex(item=>item.id===message.id);
    let userIndex = messageIndex-1;
    while (userIndex>=0 && messages[userIndex].sender!=='user') userIndex--;
    if (userIndex<0 || isAiResponding || !selectedModel) return;
    const userMessage = messages[userIndex];
    const images = imageAttachmentsByMessage[userMessage.id] || [];
    if (userMessage.content.includes('Attached image:') && images.length===0) {
      setAttachmentStatus('The original image is no longer available in this session. Attach it again before regenerating this response.');
      return;
    }
    setIsAiResponding(true);
    setRetryingMessageId(message.id);
    setAttachmentStatus('Regenerating response…');
    try {
      const retryConversation = messages.slice(0,userIndex+1).map(({id,sender,content})=>({id,sender,content}));
      const result = await requestAIResponse(retryConversation,selectedModel,contextByMessage[userMessage.id]||null,images);
      if (!result.success || !result.response) {
        setAttachmentStatus(result.error||'Unable to regenerate this response.');
        return;
      }
      const saved = message.persisted
        ? await updateAssistantMessage(chatId,message.id,result.response,selectedModel)
        : await addMessage(chatId,'ai',result.response,selectedModel,message.id);
      if (!saved.success) {
        setAttachmentStatus(saved.error||'Unable to save the regenerated response.');
        return;
      }
      setMessages(current=>current.map(item=>item.id===message.id?{...item,content:result.response!,persisted:true}:item));
      setAttachmentStatus('Response regenerated.');
    } catch(error) {
      console.error('Unable to regenerate chat response:',error);
      setAttachmentStatus('Unable to regenerate this response. Please try again.');
    } finally {
      setRetryingMessageId(null);
      setIsAiResponding(false);
      textareaRef.current?.focus();
    }
  };

  const handleSubmit = async () => {
    const currentPrompt = prompt.trim();
    if ((!currentPrompt && pendingAttachments.length===0) || isAiResponding || isReadingAttachments || isRecording || !selectedModel) {
        if (!selectedModel) console.error("Submit cancelled: No model selected");
        return;
    }

    const attachments = [...pendingAttachments];
    const contextItem = attachedContextItem;
    const attachmentText = attachments.map(item=>{
      if (item.kind==='file') return `Attached file: ${item.name}\n${item.content}`;
      if (item.kind==='image') return `Attached image: ${item.name}`;
      return `User-provided website or map link (page contents are not fetched automatically): ${item.url}`;
    });
    const userContent = [currentPrompt,...attachmentText].filter(Boolean).join('\n\n').trim();
    if (userContent.length>32000) {
      setAttachmentStatus('The message and its attachments exceed the 32,000-character limit.');
      return;
    }
    const images = attachments.filter((item):item is Extract<PendingAttachment,{kind:'image'}>=>item.kind==='image')
      .map(({mimeType,dataUrl})=>({mimeType,data:dataUrl.slice(dataUrl.indexOf(',')+1)}));
    const newUserMessage: Message = {
      id: uuidv4(),
      sender: 'user',
      content: userContent,
      images: attachments.filter((item):item is Extract<PendingAttachment,{kind:'image'}>=>item.kind==='image').map(({name,dataUrl})=>({name,dataUrl}))
    };

    const updatedMessagesForApi = [
      ...messages.map(({id,sender,content})=>({id,sender,content})),
      {id:newUserMessage.id,sender:newUserMessage.sender,content:newUserMessage.content},
    ];
    setMessages([...messages,newUserMessage]);
    setImageAttachmentsByMessage(current=>({...current,[newUserMessage.id]:images}));
    if (contextItem) setContextByMessage(current=>({...current,[newUserMessage.id]:contextItem.id}));

    setPrompt("");
    setPendingAttachments([]);
    setAttachmentStatus(null);
    setAttachedContextItem(null);

    setIsAiResponding(true);
    if(textareaRef.current) textareaRef.current.disabled = true;

    try {
      const savedUser = await addMessage(chatId, 'user', userContent, undefined, newUserMessage.id);
      if (!savedUser.success) {
        setAttachmentStatus('Unable to save your message. Please try again.');
        setMessages(messages);
        setPrompt(currentPrompt);
        setPendingAttachments(attachments);
        setAttachedContextItem(contextItem);
        return;
      }
      setMessages(current=>current.map(message=>message.id===newUserMessage.id?{...message,persisted:true}:message));
      const result = await requestAIResponse(updatedMessagesForApi,selectedModel,contextItem?.id||null,images);

      let aiContent: string;
      let messageToSave: Message | null = null;

      if (result.success && result.response) {
        aiContent = result.response;
         messageToSave = {
              id: uuidv4(),
              sender: 'ai',
              content: aiContent
            };
        const saved = await addMessage(chatId, 'ai', aiContent, selectedModel, messageToSave.id);
        messageToSave.persisted = saved.success;
        if (!saved.success) setAttachmentStatus('Reply generated, but could not be saved. Copy it before refreshing.');
      } else {
        aiContent = `Error: ${result.error || 'Failed to get response from AI.'}`;
        messageToSave = {
              id: uuidv4(),
              sender: 'ai',
              content: aiContent
            };
        console.error("Follow-up AI Error:", result.error);
      }
      setMessages(prev => [...prev, messageToSave!]);

    } catch (error) {
      console.error("Error calling getAIResponse (follow-up):", error);
      const errorMsg: Message = {
        id: uuidv4(),
        sender: 'ai',
        content: "An error occurred while processing your request."
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsAiResponding(false);
      if(textareaRef.current) textareaRef.current.disabled = false;
      textareaRef.current?.focus();
    }
  };

  // Submit only requires prompt text now
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (preferences.enter_to_send && !e.nativeEvent.isComposing && e.key === 'Enter' && !e.shiftKey && (prompt.trim() || pendingAttachments.length>0) && !isAiResponding && !isReadingAttachments && !isRecording) {
        e.preventDefault();
        handleSubmit();
    }
  };

  // --- handleModelSelect ---
  const handleModelSelect = async (modelId: string) => {
    setSelectedModel(modelId);
    setIsModelDropdownOpen(false);
    try {
      // Ensure updateUserSelectedModel is imported if needed here
      await updateUserSelectedModel(modelId);
    } catch (error) {
       console.error("Error calling updateUserSelectedModel:", error);
    }
  };

  // --- scroll effect ---
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ... JSX for the Active Chat View ---
  return (
    <div className="h-full flex flex-col">
      <div className="conversation-toolbar"><button type="button" disabled={!messages.length || isAiResponding} onClick={()=>exportConversation(messages)}>Export Markdown</button><button type="button" disabled={!messages.length || isAiResponding} onClick={()=>exportConversation(messages,'json')}>Export JSON</button><button type="button" onClick={()=>messagesEndRef.current?.scrollIntoView({behavior:"smooth"})}>Jump to latest</button></div>
      {/* Chat message display area - Removed padding from main */}
      <main> { /* Removed p-6 pb-24 and other classes*/ }
        {/* Added bottom padding here to prevent overlap with sticky input */}
        <div className="w-full max-w-3xl mx-auto space-y-6 pb-24" role="log" aria-label="Conversation messages">
          {/* Loading state for messages */}
          {isLoadingMessages && (
            <>
              <Skeleton className="h-10 w-3/4 rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg self-end" />
              <Skeleton className="h-10 w-3/4 rounded-lg" />
            </>
          )}
          {/* Error state for messages */}
          {!isLoadingMessages && messageError && (
            <div className="text-center text-red-600 py-4">{messageError}</div>
          )}
          {/* Display existing/new messages */}
          {!isLoadingMessages && !messageError && messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                { /* User Message Styling */ }
                {msg.sender === 'user' && (
                    <div className="max-w-[75%] px-4 py-2 rounded-xl bg-gray-100 text-gray-800">
                        <MessageContent content={msg.content}/>
                        <div className="conversation-toolbar"><button type="button" onClick={()=>handleCopyResponse(msg.content)}>Copy</button><button type="button" disabled={isAiResponding} onClick={()=>{setPrompt(msg.content);textareaRef.current?.focus();}}>Resend</button><button type="button" disabled={isAiResponding || !msg.persisted} onClick={async()=>{
                          const text=window.prompt('Edit message. Later turns will be removed; send a follow-up or regenerate to continue.',msg.content);
                          if(text===null || !text.trim() || text===msg.content)return;
                          if(!window.confirm('Save this edit and remove all later messages?'))return;
                          setIsAiResponding(true);
                          try {const result=await editConversationMessage(chatId,msg.id,text);if(!result.success)throw new Error(result.error);const saved=await getMessagesForChat(chatId);setHasTriggeredInitialResponse(true);setMessages(saved.map(m=>({...m,persisted:true})));setAttachmentStatus('Edit saved. Send a follow-up to continue.');}catch{setAttachmentStatus('Unable to edit message.');}finally{setIsAiResponding(false);}
                        }}>Edit</button>{messages.at(-1)?.id===msg.id && <button type="button" disabled={isAiResponding || !selectedModel} onClick={()=>{setHasTriggeredInitialResponse(true);void triggerInitialResponse(msg,messages);}}>Generate response</button>}<button type="button" disabled={isAiResponding || !msg.persisted} onClick={async()=>{try{const result=await duplicateConversation(chatId,msg.id);if(result.success&&result.id)router.push(`/c/${result.id}`);else setAttachmentStatus(result.error||'Unable to branch conversation.');}catch{setAttachmentStatus('Unable to branch conversation.');}}}>Branch here</button></div>
                        {msg.images?.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {msg.images.map(image=><Image key={`${msg.id}-${image.name}`} src={image.dataUrl} alt={`Attached image: ${image.name}`} width={224} height={192} unoptimized className="max-h-48 max-w-56 rounded-lg border border-gray-200 object-contain" />)}
                          </div>
                        ):null}
                    </div>
                )}
                { /* AI Message Styling */ }
                {msg.sender === 'ai' && (
                    <div className="max-w-[90%] text-gray-800">
                        <MessageContent content={msg.content}/>
                        <div className="mt-2 flex flex-wrap items-center gap-1 text-gray-500" aria-label="Response actions">
                          {(['positive','negative','report'] as const).map(rating=><button key={rating} type="button" disabled={!msg.persisted || isAiResponding} onClick={async()=>{const detail=rating==='report'?window.prompt('Describe the issue (up to 2,000 characters)'):'';if(detail===null)return;try{const result=await saveMessageFeedback(msg.id,rating,detail);setAttachmentStatus(result.success?'Feedback saved.':result.error||'Unable to save feedback.');}catch{setAttachmentStatus('Unable to save feedback.');}}}>{rating==='positive'?'Helpful':rating==='negative'?'Not helpful':'Report'}</button>)}
                          <button type="button" onClick={()=>handleCopyResponse(msg.content)} aria-label="Copy response" title="Copy response" className="rounded-md p-2 hover:bg-gray-100"><Clipboard className="h-4 w-4" /></button>
                          <button type="button" onClick={()=>handleReadAloud(msg)} aria-label={activeSpeechMessageId===msg.id?'Stop reading response aloud':'Read response aloud'} title={activeSpeechMessageId===msg.id?'Stop reading':'Read aloud'} className="rounded-md p-2 hover:bg-gray-100"><Volume2 className={`h-4 w-4 ${activeSpeechMessageId===msg.id?'text-emerald-700':''}`} /></button>
                          <button type="button" onClick={()=>handleRetryResponse(msg)} disabled={isAiResponding || retryingMessageId===msg.id} aria-label="Regenerate response" title="Regenerate response" className="rounded-md p-2 hover:bg-gray-100 disabled:opacity-50">{retryingMessageId===msg.id?<Loader2 className="h-4 w-4 animate-spin"/>:<RotateCcw className="h-4 w-4"/>}</button>
                          <button type="button" onClick={()=>handleSaveResponse(msg)} disabled={savedResponseIds.includes(msg.id)||savingResponseIds.includes(msg.id)} aria-label={savedResponseIds.includes(msg.id)?'Response saved':'Save response to Context'} title={savedResponseIds.includes(msg.id)?'Saved to Context':'Save to Context'} className="rounded-md p-2 hover:bg-gray-100 disabled:opacity-50">{savingResponseIds.includes(msg.id)?<Loader2 className="h-4 w-4 animate-spin"/>:savedResponseIds.includes(msg.id)?<Check className="h-4 w-4"/>:<Bookmark className="h-4 w-4"/>}</button>
                          <button type="button" onClick={()=>handleShareResponse(msg.content)} aria-label="Share response" title="Share response" className="rounded-md p-2 hover:bg-gray-100"><Share2 className="h-4 w-4" /></button>
                        </div>
                    </div>
                )}
            </div>
          ))}

          {isAiResponding && streamText && <div aria-label="Streaming response"><MessageContent content={streamText}/></div>}
          {isAiResponding && <button type="button" onClick={()=>responseAbort.current?.abort()}>Stop generation</button>}
          {/* AI Loading Indicator */}
          {isAiResponding && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 text-gray-500 shadow-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Thinking...</span>
              </div>
            </div>
          )}

          {/* Element to scroll to */}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input area - Sticky at the bottom */}
      <div className="w-full max-w-3xl mx-auto pb-4 sticky bottom-0 bg-gradient-to-t from-white via-white/90 to-transparent pt-4">
        <div className="relative rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm" onDragOver={event=>{if(event.dataTransfer.types.includes('Files'))event.preventDefault();}} onDrop={event=>{if(event.dataTransfer.files.length){event.preventDefault();void addFiles(Array.from(event.dataTransfer.files));}}}>
          {/* Input Row */}
          <div className="flex flex-col">
            {/* Text input section */}
            <div className="w-full relative">
              <textarea
                spellCheck={preferences.spellcheck}
                aria-label="Message"
                ref={textareaRef}
                // Reverted class changes, context no longer shown here
                className={`w-full resize-none text-base focus:outline-none text-stone-900 placeholder:text-gray-500 bg-transparent px-5 py-3 min-h-[48px] max-h-[360px] pr-10`}
                placeholder={"Ask follow-up..."} // Reverted placeholder
                value={prompt}
                maxLength={32000}
                onPaste={event=>{const images=Array.from(event.clipboardData.files).filter(file=>file.type.startsWith('image/'));if(images.length){event.preventDefault();void addFiles(images);}}}
                onChange={handlePromptChange}
                onKeyDown={handleTextareaKeyDown}
                rows={1}
                disabled={isAiResponding}
              />
            </div>

            {pendingAttachments.length>0 && (
              <div className="flex flex-wrap gap-2 px-4 pb-2" aria-label="Pending attachments">
                {pendingAttachments.map(item=>(
                  <span key={item.id} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700">
                    {item.kind==='image'?<ImageIcon className="h-3.5 w-3.5"/>:item.kind==='link'?<Link2 className="h-3.5 w-3.5"/>:<FileUp className="h-3.5 w-3.5"/>}
                    <span className="max-w-48 truncate">{item.kind==='link'?item.name:item.name}</span>
                    <button type="button" onClick={()=>setPendingAttachments(current=>current.filter(value=>value.id!==item.id))} aria-label={`Remove ${item.name}`} className="rounded p-0.5 hover:bg-gray-200"><X className="h-3.5 w-3.5"/></button>
                  </span>
                ))}
              </div>
            )}
            {attachedContextItem && (
              <div className="flex items-center gap-2 px-4 pb-2 text-xs text-gray-600">
                <BookText className="h-3.5 w-3.5"/>
                <span className="max-w-56 truncate">Context: {attachedContextItem.name}</span>
                <button type="button" onClick={handleRemoveContext} aria-label="Remove attached context" className="rounded p-0.5 hover:bg-gray-100"><X className="h-3.5 w-3.5"/></button>
              </div>
            )}

            {/* Controls section */}
            <div className="border-t border-gray-200 px-4 py-2 flex items-center justify-between">
              {/* Left Controls */}
              <div className="flex items-center gap-2">
                {/* Model Selector */}
                <div className="relative" ref={dropdownRef}>
                   <button
                        type="button"
                        aria-label="Choose AI agent"
                        className="text-gray-500 flex items-center gap-1 text-sm hover:bg-gray-100 px-2 py-1 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={(e) => {
                            if (isLoadingModels) return;
                            const rect = e.currentTarget.getBoundingClientRect();
                            setModelDropdownPosition({ top: rect.top - 4, left: rect.left });
                            setIsModelDropdownOpen(!isModelDropdownOpen);
                        }}
                        disabled={isLoadingModels}
                    >
                        <span className="text-xs text-gray-400">Agent</span>
                        <span>
                            {isLoadingModels ? 'Loading...' : getDisplayName(selectedModel) ? getDisplayName(selectedModel) : enabledModels.length > 0 ? 'Select Model' : 'No Models Enabled'}
                        </span>
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 10L4 6H12L8 10Z" fill="#6B7280"/></svg>
                    </button>
                    {/* Model Dropdown Portal */}
                    {isModelDropdownOpen && typeof document !== 'undefined' && createPortal(
                        <div className="fixed bg-white rounded-md shadow-lg border border-gray-200 w-56 z-50" style={{ top: `${modelDropdownPosition.top}px`, left: `${modelDropdownPosition.left}px`, transform: 'translateY(-100%)' }}>
                            <div className="p-1.5">
                            {enabledModels.map((modelId) => {
                                const displayName = getDisplayName(modelId);
                                return (
                                    <div
                                        key={modelId}
                                        className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 cursor-pointer rounded-md"
                                        onClick={() => handleModelSelect(modelId)}
                                    >
                                        <span className="text-gray-800 text-sm">{displayName}</span>
                                        {selectedModel === modelId && <Check className="h-4 w-4 text-black" strokeWidth={2} />}
                                    </div>
                                );
                            })}
                            {enabledModels.length === 0 && !isLoadingModels && (
                                <div className="px-3 py-2 text-sm text-gray-500 text-center"> No models enabled. Go to Settings &gt; Models. </div>
                            )}
                            </div>
                        </div>,
                    document.body)}
                </div>
                {/* Add Content Dropdown with Badge */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="relative text-gray-500 hover:bg-gray-100 h-8 w-8 p-1.5 rounded-md mr-2" // Added relative positioning
                      aria-label="Add content"
                      // Removed disabled logic based on attachment
                    >
                      <PlusIcon className="h-5 w-5" />
                      {/* --- Attachment Count Badge --- */}
                      {attachmentCount > 0 && (
                        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-black text-white text-[10px] font-semibold">
                          {attachmentCount}
                        </span>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    <DropdownMenuItem onSelect={()=>fileInputRef.current?.click()} className="flex items-center gap-2">
                      <FileUp className="h-4 w-4" />
                      <span>Upload files or images</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={()=>setIsLinkDialogOpen(true)} className="flex items-center gap-2">
                      <Link2 className="h-4 w-4" />
                      <span>Add website or map link</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!preferences.context_enabled}
                      onSelect={() => setIsContextModalOpen(true)}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center">
                        <BookText className="mr-2 h-4 w-4 flex-shrink-0" />
                        <span className="flex-grow">Add Context</span>
                      </div>
                      {attachedContextItem && <Check className="h-4 w-4 text-black ml-2 flex-shrink-0" strokeWidth={2} />}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <button type="button" onClick={handleToggleMicrophone} disabled={isAiResponding} aria-pressed={isRecording} aria-label={isRecording?'Stop speech input':'Start speech input'} title={isRecording?'Stop speech input':'Dictate a message'} className={`grid h-8 w-8 place-items-center rounded-md transition-colors disabled:opacity-50 ${isRecording?'bg-red-50 text-red-700':'text-gray-500 hover:bg-gray-100'}`}>
                  <Mic className="h-4 w-4"/>
                </button>
              </div>
              {/* Submit Button */}
              <button
                type="button"
                className={`flex items-center justify-center h-8 w-8 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${ prompt.trim() || attachmentCount>0 ? "bg-black text-white hover:bg-gray-800" : "bg-white text-gray-400 border border-gray-300"}`}
                aria-label="Send message"
                onClick={handleSubmit}
                disabled={(!prompt.trim() && pendingAttachments.length===0) || isAiResponding || isReadingAttachments || isRecording}
              >
                {isAiResponding ? <Loader2 className="h-4 w-4 animate-spin"/> : <ArrowUp className="h-4 w-4" />}
              </button>
            </div>
            <input ref={fileInputRef} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif,.txt,.md,.csv,.json,.html,.htm,.xml,.css,.js,.jsx,.ts,.tsx,.py,.sql,.yaml,.yml,.toml,.sh,.go,.rs,.java,.c,.cpp,.h" className="hidden" onChange={handleFilesSelected} aria-label="Choose files and images"/>
            {attachmentStatus && <p role="status" aria-live="polite" className="px-4 pb-2 text-xs text-gray-500">{attachmentStatus}</p>}
          </div>
        </div>
      </div>

      {/* Settings Modal (Can be kept or removed depending on desired functionality) */}
      <SettingsModal
         isOpen={isSettingsModalOpen}
         setIsOpen={setIsSettingsModalOpen}
         onSettingsChanged={handleSettingsChanged}
       />

      {/* --- Render Context Modal (with updated props) --- */}
      <ContextSelectorModal
        isOpen={isContextModalOpen}
        setIsOpen={setIsContextModalOpen}
        onAddContext={handleAddContext}
        attachedContextItemId={attachedContextItem?.id || null} // Pass current ID
        onRemoveContext={handleRemoveContext} // Pass remove handler
      />

      {isLinkDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={event=>{if(event.target===event.currentTarget)setIsLinkDialogOpen(false);}}>
          <section role="dialog" aria-modal="true" aria-labelledby="chat-link-dialog-title" className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 id="chat-link-dialog-title" className="text-base font-semibold text-gray-900">Add a website or map link</h2>
                <p className="mt-1 text-sm text-gray-500">The URL is shared with the model as a reference; its page contents are not fetched automatically.</p>
              </div>
              <button type="button" onClick={()=>setIsLinkDialogOpen(false)} aria-label="Close link dialog" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"><X className="h-4 w-4"/></button>
            </div>
            <form onSubmit={handleAddLink} className="space-y-4">
              <label htmlFor="chat-link-input" className="block text-sm font-medium text-gray-700">Website or map URL</label>
              <input id="chat-link-input" type="url" required value={linkDraft} onChange={event=>setLinkDraft(event.target.value)} placeholder="https://…" className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/15"/>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={()=>setIsLinkDialogOpen(false)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
                <button type="submit" className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800">Add link</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* --- Hidden File Input (remains) --- */}
    </div>
  );
}
