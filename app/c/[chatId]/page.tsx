'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { ChatInterface } from '@/components/chat-interface';

// Wrapper component to handle Suspense
function ChatPageContent() {
  const params = useParams();
  // const searchParams = useSearchParams(); // Remove unused searchParams

  const chatId = typeof params.chatId === 'string' ? params.chatId : undefined;
  // const initialPrompt = searchParams.get('prompt'); // Remove unused initialPrompt

  if (!chatId) {
    // Handle cases where chatId might be missing or an array (though unlikely here)
    return <div>Error: Invalid or missing Chat ID.</div>;
  }

  return (
    <ChatInterface 
      key={chatId}
      chatId={chatId} 
      // Remove unused initialPrompt prop
      // initialPrompt={initialPrompt ? decodeURIComponent(initialPrompt) : undefined} 
    />
  );
}

export default function ChatPage() {
  // No longer needs Suspense just for searchParams
  return (
    <div className="h-full">
      {/* <Suspense fallback={<div>Loading Chat...</div>}> */}
        <ChatPageContent />
      {/* </Suspense> */}
    </div>
  );
} 