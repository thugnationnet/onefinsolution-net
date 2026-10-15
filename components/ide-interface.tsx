"use client";

import { availableModels } from '@/lib/models';
import { useWorkspacePreferences } from './workspace-preferences';
import React, { useState, useRef, useEffect, useCallback } from "react";
import { ArrowUp, Check, Loader2, PlusIcon, BookText, Mic } from "lucide-react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { ContextItem, getUserModelSettings, updateUserSelectedModel, startNewChat } from '@/app/actions';
import { SettingsModal } from "./settings-modal";
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import { ContextSelectorModal } from "./context-selector-modal";
import { useAuth } from '@/lib/auth';

// Define available models with display names within this component
// TODO: Centralize this definition later if needed
const availableModelsForDisplay = availableModels;

// Helper to find display name from ID
const getDisplayName = (id: string | null): string | null => {
  if (!id) return null;
  const model = availableModelsForDisplay.find(m => m.id === id);
  return model ? model.displayName : id; // Fallback to ID if not found
};

const placeholderPrompts = [
  "how can I implement a chatbot for my website?",
  "explain how to create a personalized customer service bot",
  "what are the best practices for chatbot conversation design?",
  "how do I integrate this chatbot with my existing website?",
  "give me ideas for implementing proactive chat suggestions",
  "what features should I add to my support chatbot?"
];

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; [index: number]: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export function IdeInterfaceComponent() {
  const preferences = useWorkspacePreferences();
  const router = useRouter();

  const [prompt, setPrompt] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // State for animated placeholder
  const [currentPlaceholder, setCurrentPlaceholder] = useState("");
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);

  // Animation refs
  const animationFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const isTypingRef = useRef<boolean>(true);
  const charIndexRef = useRef<number>(0);
  const pauseUntilRef = useRef<number>(0);

  // Animation timing constants (in milliseconds)
  const ANIMATION_SPEED = 4;
  const PAUSE_AFTER_TYPE = 3500;

  // Add state for showing tab button
  const [showTabButton, setShowTabButton] = useState(false);

  // Add state for model dropdown
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [modelDropdownPosition, setModelDropdownPosition] = useState({ top: 0, left: 0 });

  // --- New State for Model Selection ---
  const [enabledModels, setEnabledModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState('');
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();

  // --- State for Settings Modal ---
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // --- State for Context Modal ---
  const [isContextModalOpen, setIsContextModalOpen] = useState(false);

  // --- State for Attachments ---
  const [attachedContextItem, setAttachedContextItem] = useState<ContextItem | null>(null);

  // --- Calculate Attachment Count ---
  const attachmentCount = (attachedContextItem ? 1 : 0);

  // --- Updated Fetch Logic (Moved and wrapped in useCallback) ---
  const loadModels = useCallback(async () => {
    setIsLoadingModels(true);
    try {
      // Fetch the object containing both enabled and selected
      const settings = await getUserModelSettings();

      // --- Simplified Logic ---
      setEnabledModels(settings.enabledModels);
      setSelectedModel(settings.selectedModel);

    } catch (error) {
      console.error("Failed to fetch user model settings:", error);
      setEnabledModels([]);
      setSelectedModel(null); // Default to null on error
    } finally {
      setIsLoadingModels(false);
    }
  }, []);

  // --- Initial Load Effect ---
  useEffect(() => { loadModels(); }, [loadModels]);
  useEffect(() => () => speechRecognitionRef.current?.stop(), []);

  // --- Callback for when settings are changed in the modal ---
  const handleSettingsChanged = useCallback(() => {
     loadModels();
  }, [loadModels]);

  // Animation function
  const animate = useCallback((timestamp: number) => {
    if (!isModelDropdownOpen) { // Only animate if chat is NOT active
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;

      const deltaTime = timestamp - lastTimeRef.current;
      const currentPromptText = placeholderPrompts[currentPromptIndex];

      // Handle pausing
      if (pauseUntilRef.current > timestamp) {
        // Only show tab button during pause if input is empty and we're not actively typing
        if (!isTypingRef.current && charIndexRef.current === currentPromptText.length && !prompt) {
          setShowTabButton(true);
        } else {
          setShowTabButton(false);
        }
        animationFrameRef.current = requestAnimationFrame(animate);
        return;
      }

      // Hide tab button when not paused
      setShowTabButton(false);

      // Determine if we should update this frame
      let shouldUpdate = false;

      if (isTypingRef.current) {
        // When typing
        if (deltaTime >= ANIMATION_SPEED) {
          shouldUpdate = true;
          lastTimeRef.current = timestamp;

          if (charIndexRef.current >= currentPromptText.length) {
            // Done typing, pause before deleting
            isTypingRef.current = false;
            pauseUntilRef.current = timestamp + PAUSE_AFTER_TYPE;
          } else {
            // Continue typing
            charIndexRef.current++;
          }
        }
      } else {
        // When deleting
        if (deltaTime >= ANIMATION_SPEED) {
          shouldUpdate = true;
          lastTimeRef.current = timestamp;

          if (charIndexRef.current <= 0) {
            // Done deleting, switch to next prompt immediately
            isTypingRef.current = true;
            setCurrentPromptIndex((prev) => (prev + 1) % placeholderPrompts.length);
          } else {
            // Continue deleting
            charIndexRef.current--;
          }
        }
      }

      // Update placeholder text if needed
      if (shouldUpdate) {
        setCurrentPlaceholder(currentPromptText.substring(0, charIndexRef.current));
      }

      // Continue animation loop
      animationFrameRef.current = requestAnimationFrame(animate);
    }
  }, [prompt, isModelDropdownOpen, currentPromptIndex]);

  // Start and clean up animation
  useEffect(() => {
    // Start animation
    animationFrameRef.current = requestAnimationFrame(animate);

    // Clean up on unmount
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [animate]);

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto';

      // Set the height to either scrollHeight or max height
      const newHeight = Math.min(Math.max(textarea.scrollHeight, 48), 360);
      textarea.style.height = `${newHeight}px`;
    }
  }, [prompt]);

  // Close dropdown when clicking outside
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

  // --- Corrected handleKeyDown and useEffect ---
  const handleKeyDown = useCallback((e: KeyboardEvent) => { // Use generic KeyboardEvent for document listener
    if (e.key === 'Tab' && showTabButton && !isModelDropdownOpen) {
      e.preventDefault();
      setPrompt(currentPlaceholder);
      setShowTabButton(false);
      isTypingRef.current = true;
      charIndexRef.current = 0;
      setCurrentPromptIndex((prev) => (prev + 1) % placeholderPrompts.length);
    }
    // Enter key check is handled by the textarea's onKeyDown prop directly now
  }, [currentPlaceholder, showTabButton, isModelDropdownOpen]);

  useEffect(() => {
    // Listener for Tab completion (on document)
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  // Specific handler for Textarea Enter key
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (preferences.enter_to_send && !e.nativeEvent.isComposing && e.key === 'Enter' && !e.shiftKey && prompt.trim()) {
        e.preventDefault();
        handleSubmit();
    }
    // Allow other keys (like Shift+Enter) to function normally
  };

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
    setShowTabButton(false);
  };

  // --- Handler to add context from the modal ---
  const handleAddContext = (item: ContextItem) => {
    setAttachedContextItem(item);
    textareaRef.current?.focus();
  };

  const handleRemoveContext = () => {
    setAttachedContextItem(null);
    textareaRef.current?.focus();
  };

  const handleToggleMicrophone = () => {
    if (isRecording) {
      speechRecognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const speechWindow = window as Window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceNotice('Speech input is not supported in this browser. Try a current version of Chrome or Edge.');
      return;
    }
    const recognition = new Recognition();
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).slice(event.resultIndex).filter((result) => result.isFinal).map((result) => result[0].transcript).join('');
      if (transcript.trim()) setPrompt((current) => `${current}${current.trim() ? ' ' : ''}${transcript.trim()}`);
    };
    recognition.onerror = (event) => {
      setIsRecording(false);
      setVoiceNotice(event.error === 'not-allowed' ? 'Allow microphone access in your browser to dictate a message.' : 'Speech input stopped. Please try again.');
    };
    recognition.onend = () => {
      setIsRecording(false);
      speechRecognitionRef.current = null;
    };
    try {
      setVoiceNotice('Listening… Speak your message, then tap the microphone to stop.');
      speechRecognitionRef.current = recognition;
      recognition.start();
      setIsRecording(true);
    } catch {
      speechRecognitionRef.current = null;
      setIsRecording(false);
      setVoiceNotice('Could not start speech input. Check microphone permission and try again.');
    }
  };

  const handleSubmit = async () => {
    if (isAuthLoading) return;
    // --- Authentication Check ---
    if (isAuthenticated === false) {
      router.push('/sign-in');
      return;
    }
    // Don't submit if auth status is still loading
    if (isAuthenticated === null) {
      return;
    }

    const currentPrompt = prompt.trim();
    if (!currentPrompt || isSubmitting) return;

    setIsSubmitting(true);
    const newChatId = uuidv4();
    const currentSelectedModel = selectedModel;

    try {
      const result = await startNewChat(
          newChatId,
          currentPrompt,
          currentSelectedModel,
          attachedContextItem?.id || null
      );

      if (result.success) {
        // Clear attachments on successful navigation
        setAttachedContextItem(null);
        router.push(`/c/${newChatId}`);
      } else {
        console.error("Failed to start new chat:", result.error);
        if (result.error?.includes('active chat subscription')) {
          router.push('/pricing');
          return;
        }
        alert(`Error: ${result.error || 'Could not start chat.'}`);
      }
    } catch (error) {
      console.error("Unexpected error starting chat:", error);
      alert("An unexpected error occurred.");
    } finally {
       setIsSubmitting(false);
    }
  };

  // --- Updated Handler for selecting a model from dropdown ---
  const handleModelSelect = async (modelId: string) => {
    setSelectedModel(modelId);
    setIsModelDropdownOpen(false);
    try {
      await updateUserSelectedModel(modelId); // Sends ID to backend
    } catch (error) {
       console.error("Error calling updateUserSelectedModel:", error);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      <main className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-3xl mx-auto px-6">
          <section className="flex flex-col items-center">
            <h1
              className="text-center font-serif font-medium mb-4 text-[clamp(42px,5vw,62px)] leading-[1.1] text-gray-900"
            >
              Build Digital World with AI
            </h1>
            <p className="text-stone-900 text-center mb-16 text-lg">
              Start with our template and customize to fit your needs
            </p>
          </section>
          <div className="w-full mx-auto relative max-w-[710px] rounded-2xl border border-gray-200 bg-[#f3f4f6] overflow-hidden mb-12 shadow-sm">
            <div className="flex flex-col">
              <div className="w-full relative">
                <textarea
                  spellCheck={preferences.spellcheck}
                  aria-label="Message"
                  ref={textareaRef}
                  className="w-full resize-none text-base focus:outline-none text-stone-900 placeholder:text-gray-500 bg-transparent px-5 py-3 min-h-[48px] max-h-[360px] pr-10"
                  placeholder={currentPlaceholder || "Ask anything..."}
                  value={prompt}
                  onChange={handlePromptChange}
                  onKeyDown={handleTextareaKeyDown}
                  rows={1}
                />
                {showTabButton && (
                  <button
                    className="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[10px] bg-gray-400/20 text-gray-500 rounded hover:bg-gray-400/30 transition-colors"
                    onClick={() => { setPrompt(currentPlaceholder); setShowTabButton(false); }}
                  >
                    tab
                  </button>
                )}
              </div>

              <div className="border-t border-gray-200 px-4 py-2 flex items-center justify-between bg-white">
                <div className="flex items-center gap-2">
                  <div className="relative" ref={dropdownRef}>
                    <button
                      className="text-gray-500 flex items-center gap-1 text-sm hover:bg-gray-100 px-2 py-1 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={(e) => {
                        if (isLoadingModels) return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        setModelDropdownPosition({ top: rect.top - 4, left: rect.left });
                        setIsModelDropdownOpen(!isModelDropdownOpen);
                      }}
                      disabled={isLoadingModels}
                    >
                      <span>
                        {isLoadingModels ? 'Loading...' : getDisplayName(selectedModel) ? getDisplayName(selectedModel) : enabledModels.length > 0 ? 'Select Model' : 'No Models Enabled'}
                      </span>
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M8 10L4 6H12L8 10Z" fill="#6B7280"/>
                      </svg>
                    </button>

                    {isModelDropdownOpen && typeof document !== 'undefined' && createPortal(
                      <div
                        className="fixed bg-white rounded-md shadow-lg border border-gray-200 w-56 z-50"
                        style={{
                          top: `${modelDropdownPosition.top}px`,
                          left: `${modelDropdownPosition.left}px`,
                          transform: 'translateY(-100%)'
                        }}
                      >
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
                                {selectedModel === modelId && (
                                   <Check className="h-4 w-4 text-black" strokeWidth={2} />
                                )}
                              </div>
                            );
                          })}

                          {enabledModels.length === 0 && !isLoadingModels && (
                            <div className="px-3 py-2 text-sm text-gray-500 text-center">
                              No models enabled. Go to Settings &gt; Models.
                            </div>
                          )}

                        </div>
                      </div>,
                      document.body
                    )}
                  </div>

                  {/* --- New Add Button with Dropdown --- */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="relative text-gray-500 hover:bg-gray-100 h-8 w-8 p-1.5 rounded-md"
                        aria-label="Add content"
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
                      {/* --- Conditional Image Item --- */}

                      {/* --- Updated Context Item - Adjusted Structure for consistent spacing --- */}
                      <DropdownMenuItem
                        disabled={!preferences.context_enabled}
                        onSelect={() => setIsContextModalOpen(true)}
                        className="flex items-center justify-between" // Keep justify-between for checkmark placement
                      >
                        {/* Keep icon and text together */}
                        <BookText className="mr-2 h-4 w-4 flex-shrink-0" /> {/* Added flex-shrink-0 */}
                        <span className="flex-grow">Add Context</span> {/* Added flex-grow */}

                        {/* Checkmark pushed to the right */}
                        {attachedContextItem && <Check className="h-4 w-4 text-black ml-2 flex-shrink-0" strokeWidth={2} />}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <button
                    type="button"
                    onClick={handleToggleMicrophone}
                    disabled={isSubmitting}
                    aria-pressed={isRecording}
                    aria-label={isRecording ? 'Stop speech input' : 'Start speech input'}
                    title={isRecording ? 'Stop speech input' : 'Dictate a message'}
                    className={`grid h-8 w-8 place-items-center rounded-md transition-colors disabled:opacity-50 ${isRecording ? 'bg-red-50 text-red-700' : 'text-gray-500 hover:bg-gray-100'}`}
                  >
                    <Mic className="h-4 w-4" />
                  </button>

                  {/* --- Hidden File Input (remains) --- */}

                </div>
                <button
                  className="flex items-center justify-center h-8 w-8 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-black text-white hover:bg-gray-800"
                  onClick={handleSubmit}
                  disabled={isAuthLoading || isSubmitting || !prompt.trim() || isLoadingModels || (enabledModels.length > 0 && !selectedModel)}
                  aria-label="Submit prompt"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowUp className="h-4 w-4" />
                  )}
                </button>
              </div>
              {voiceNotice && <p className="px-4 pb-2 text-xs text-gray-500" role="status" aria-live="polite">{voiceNotice}</p>}
            </div>
          </div>

          <section className="w-full text-center mt-16" aria-labelledby="prompt-suggestions">
            <div className="flex flex-wrap gap-4 items-center justify-center">
              <h2 id="prompt-suggestions" className="text-gray-800 text-sm whitespace-nowrap">
                Try these prompts:
              </h2>
              <div className="flex flex-wrap gap-2 justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full bg-white border-gray-200 text-gray-800"
                  onClick={() => {
                    setPrompt("customer support");
                    setShowTabButton(false);
                  }}
                >
                  customer support
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full bg-white border-gray-200 text-gray-800"
                  onClick={() => {
                    setPrompt("integration guide");
                    setShowTabButton(false);
                  }}
                >
                  integration guide
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full bg-white border-gray-200 text-gray-800"
                  onClick={() => {
                    setPrompt("conversation flows");
                    setShowTabButton(false);
                  }}
                >
                  conversation flows
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full bg-white border-gray-200 text-gray-800"
                  onClick={() => {
                    setPrompt("AI capabilities");
                    setShowTabButton(false);
                  }}
                >
                  AI capabilities
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full bg-white border-gray-200 text-gray-800"
                  onClick={() => {
                    setPrompt("setup tutorial");
                    setShowTabButton(false);
                  }}
                >
                  setup tutorial
                </Button>
              </div>
            </div>
          </section>
        </div>
      </main>

      <SettingsModal
         isOpen={isSettingsModalOpen}
         setIsOpen={setIsSettingsModalOpen}
         onSettingsChanged={handleSettingsChanged}
       />

      {/* Pass new props to ContextSelectorModal */}
      <ContextSelectorModal
        isOpen={isContextModalOpen}
        setIsOpen={setIsContextModalOpen}
        onAddContext={handleAddContext}
        attachedContextItemId={attachedContextItem?.id || null} // Pass current ID
        onRemoveContext={handleRemoveContext} // Pass remove handler
      />
    </div>
  );
}
