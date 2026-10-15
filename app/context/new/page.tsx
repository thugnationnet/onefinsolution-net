'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input"; // Remove unused Input
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ExclamationTriangleIcon, ArrowLeftIcon } from '@radix-ui/react-icons';
// Need addContextItem again
import { addContextItem } from '@/app/actions';
// Need toast again
import { toast } from 'sonner';

export default function NewContextItemPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep console log for debugging if needed


  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {

    e.preventDefault();
    if (!name.trim() || !content.trim() || isSubmitting) {

      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await addContextItem(name, content);
      if (result.success && result.newItem) {
        toast.success(`Context item "${result.newItem.name}" added!`);
        router.push('/context');
      } else {
        throw new Error(result.error || "Failed to add item.");
      }
    } catch (err: unknown) {
      console.error("Add context item error:", err);
      const errorMessage = err instanceof Error ? err.message : "Could not add context item.";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container max-w-3xl mx-auto py-10 px-4 md:px-6">
        {/* Top Bar: Back Button and Save Button */}
        <div className="flex justify-between items-center mb-8">
            <Button variant="ghost" size="sm" onClick={() => router.back()} className="inline-flex items-center gap-1 text-stone-600 hover:text-stone-900 px-2">
                 <ArrowLeftIcon className="h-4 w-4"/>
                 <span>Back</span>
            </Button>
            {/* Save Button Moved Back Here */}
            <Button
                id="save-context-button" // Add an ID for easier selection if needed
                size="sm"
                onClick={() => {

                    // Find the form using a more reliable method if possible, e.g., ID
                    const form = document.getElementById('new-context-form') as HTMLFormElement | null;
                    if (form) {

                        form.requestSubmit(); // Use requestSubmit for proper validation trigger
                    } else {
                        console.error("Save button could not find form with ID 'new-context-form'!");
                    }
                }}
                disabled={isSubmitting || !name.trim() || !content.trim()}
                className="h-8 px-4"
            >
               {isSubmitting ? "Saving..." : "Save"}
            </Button>
        </div>

        {/* Form with an ID */}
        <form onSubmit={handleSubmit} id="new-context-form">
            {/* Name Input */}
            <input
                 type="text"
                 id="context-name"
                 placeholder="Untitled"
                 value={name}
                 onChange={(e) => setName(e.target.value)} // Standard input onChange
                 required
                 disabled={isSubmitting}
                 // Apply only the necessary Notion-like styles - ADD h-auto
                 className="w-full border-0 focus:ring-0 focus:outline-none p-0 text-4xl font-semibold h-auto mb-4 bg-transparent text-stone-700 placeholder:text-4xl placeholder:font-semibold placeholder:text-stone-400/70"
            />

            {/* Content Textarea */}
            <Textarea
                 id="context-content"
                 placeholder="Write reference information for your chats..."
                 value={content}
                 onChange={(e) => setContent(e.target.value)}
                 required
                 disabled={isSubmitting}
                 className="w-full border-0 focus-visible:ring-0 focus:outline-none min-h-[300px] bg-white shadow-none text-base text-stone-900 resize-none placeholder:text-stone-500 py-2 leading-relaxed"
            />

             {/* Error Display */}
             {error && (
               <Alert variant="destructive" className="mt-6 text-sm p-3">
                  <ExclamationTriangleIcon className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
               </Alert>
             )}
        </form>
    </div>
  );
}
