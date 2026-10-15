'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CalendarIcon, ClockIcon, ExclamationTriangleIcon, ArrowLeftIcon } from '@radix-ui/react-icons';
import { getContextItemById, updateContextItem, ContextItem } from '@/app/actions';
import { toast } from 'sonner';

function formatDate(dateString: string): string {
    if (!dateString) return 'N/A';
    try {
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    } catch (e) {
        console.error("Error formatting date:", e);
        return dateString;
    }
}

export default function ContextDetailPage() {
    const params = useParams();
    const router = useRouter();
    const contextId = typeof params.contextId === 'string' ? params.contextId : null;

    const [item, setItem] = useState<ContextItem | null>(null);
    const [editableName, setEditableName] = useState('');
    const [editableContent, setEditableContent] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchItem = useCallback(async () => {
        if (!contextId) {
            setError("Invalid context item ID.");
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const fetchedItem = await getContextItemById(contextId);
            if (fetchedItem) {
                setItem(fetchedItem);
                setEditableName(fetchedItem.name);
                setEditableContent(fetchedItem.content);
                setIsDirty(false);
            } else {
                setError("Context item not found or you don't have permission to view it.");
            }
        } catch (err) {
            console.error("Failed to fetch context item:", err);
            setError("Could not load context item. Please try again.");
        } finally {
            setIsLoading(false);
        }
    }, [contextId]);

    useEffect(() => {
        fetchItem();
    }, [fetchItem]);

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setEditableName(e.target.value);
        setIsDirty(true);
    };

    const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setEditableContent(e.target.value);
        setIsDirty(true);
    };

    const handleSave = async () => {
        if (!item || !isDirty || isSaving || !editableName.trim() || !editableContent.trim()) {

            return;
        }

        setIsSaving(true);
        setError(null);
        try {
            const result = await updateContextItem(item.id, editableName, editableContent);
            if (result.success && result.updatedItem) {
                setItem(result.updatedItem);
                setEditableName(result.updatedItem.name);
                setEditableContent(result.updatedItem.content);
                setIsDirty(false);
                toast.success("Context item saved!");
            } else {
                throw new Error(result.error || "Failed to save item.");
            }
        } catch (err: unknown) {
            console.error("Save context item error:", err);
            const message = err instanceof Error ? err.message : "Could not save context item.";
            setError(message);
            toast.error(message);
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="container max-w-3xl mx-auto py-10 px-4 md:px-6 space-y-6">
                <Skeleton className="h-10 w-3/4 rounded-md" />
                <div className="space-y-2">
                     <Skeleton className="h-4 w-1/4 rounded-md" />
                     <Skeleton className="h-4 w-1/4 rounded-md" />
                </div>
                <Skeleton className="h-40 w-full rounded-md" />
            </div>
        );
    }

    if (error || !item) {
        return (
            <div className="container max-w-3xl mx-auto py-10 px-4 md:px-6">
                 <Button variant="outline" size="sm" onClick={() => router.back()} className="mb-4 flex items-center gap-1">
                    <ArrowLeftIcon />
                    Back
                 </Button>
                 <Alert variant="destructive">
                    <ExclamationTriangleIcon className="h-4 w-4" />
                    <AlertTitle>Error</AlertTitle>
                    <AlertDescription>{error || "Context item not found."}</AlertDescription>
                 </Alert>
            </div>
        );
    }

    return (
        <div className="container max-w-3xl mx-auto py-10 px-4 md:px-6">
            <div className="flex justify-between items-center mb-8">
                <Button variant="ghost" size="sm" onClick={() => router.back()} className="inline-flex items-center gap-1 text-stone-600 hover:text-stone-900 px-2">
                    <ArrowLeftIcon className="h-4 w-4"/>
                    <span>Back</span>
                </Button>
                <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={!isDirty || isSaving || !editableName.trim() || !editableContent.trim()}
                    className="h-8 px-4"
                >
                   {isSaving ? "Saving..." : "Save"}
                </Button>
            </div>

            <input
                 type="text"
                 id="context-name"
                 placeholder="Untitled"
                 value={editableName}
                 onChange={handleNameChange}
                 required
                 disabled={isSaving}
                 className="w-full border-0 focus:ring-0 focus:outline-none p-0 text-4xl font-semibold h-auto mb-4 bg-transparent text-stone-700 placeholder:text-4xl placeholder:font-semibold placeholder:text-stone-400/70"
            />

             <div className="flex flex-col sm:flex-row gap-x-6 gap-y-2 text-sm text-stone-500 mb-8 border-y border-stone-100 py-3">
                 <div className="flex items-center gap-1.5">
                     <CalendarIcon className="h-4 w-4" />
                     <span>Created:</span>
                     <span className="font-medium text-stone-700">{formatDate(item.created_at)}</span>
                 </div>
                 <div className="flex items-center gap-1.5">
                     <ClockIcon className="h-4 w-4" />
                     <span>Updated:</span>
                     <span className="font-medium text-stone-700">{formatDate(item.updated_at)}</span>
                 </div>
             </div>

            <Textarea
                 id="context-content"
                 placeholder="Write reference information for your chats..."
                 value={editableContent}
                 onChange={handleContentChange}
                 required
                 disabled={isSaving}
                 className="w-full border-0 focus-visible:ring-0 focus:outline-none min-h-[300px] bg-white shadow-none text-base text-stone-900 resize-none placeholder:text-stone-500 py-2 leading-relaxed"
            />

             {error && !isLoading && (
                <Alert variant="destructive" className="mt-6 text-sm p-3">
                    <ExclamationTriangleIcon className="h-4 w-4" />
                    <AlertTitle>Save Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
             )}
        </div>
    );
}
