'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Check, Search } from 'lucide-react';
import { getContextItems, ContextItem } from '@/app/actions';

interface ContextSelectorModalProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onAddContext: (item: ContextItem) => void;
  attachedContextItemId: string | null;
  onRemoveContext: () => void;
}

export function ContextSelectorModal({ 
  isOpen, 
  setIsOpen, 
  onAddContext, 
  attachedContextItemId,
  onRemoveContext
}: ContextSelectorModalProps) {
  const [items, setItems] = useState<ContextItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(attachedContextItemId);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchItems = useCallback(async () => {
    if (!isOpen) return;
    setIsLoading(true);
    setError(null);
    setSelectedItemId(attachedContextItemId);
    setSearchTerm('');
    try {
      const fetchedItems = await getContextItems();
      setItems(fetchedItems);
    } catch (err) {
      console.error("Failed to fetch context items for modal:", err);
      setError("Could not load context items.");
    } finally {
      setIsLoading(false);
    }
  }, [isOpen, attachedContextItemId]);

  useEffect(() => {
    if (isOpen) {
      fetchItems();
    }
  }, [isOpen, fetchItems]);

  const filteredItems = useMemo(() => {
    if (!searchTerm) {
      return items;
    }
    const lowerCaseSearchTerm = searchTerm.toLowerCase();
    return items.filter(item => 
      item.name.toLowerCase().includes(lowerCaseSearchTerm) || 
      item.content.toLowerCase().includes(lowerCaseSearchTerm)
    );
  }, [items, searchTerm]);

  const handleConfirmAdd = () => {
    if (selectedItemId && selectedItemId !== attachedContextItemId) {
      const selectedItem = items.find(item => item.id === selectedItemId);
      if (selectedItem) {
        onAddContext(selectedItem);
      }
    } else if (!selectedItemId && attachedContextItemId) {
      onRemoveContext();
    }
    setIsOpen(false);
  };

  const hasChanged = selectedItemId !== attachedContextItemId;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Context to Prompt</DialogTitle>
          <DialogDescription>
            Select a context item or click the selected item again to remove it.
          </DialogDescription>
        </DialogHeader>
        
        <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
            <Input
              placeholder="Search context items..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
        </div>

        <div className="mt-2">
          {isLoading && (
            <div className="space-y-2 pr-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm px-1 py-2">
              <AlertCircle className="h-4 w-4" /> 
              <span>{error}</span>
            </div>
          )}
          {!isLoading && !error && items.length === 0 && (
            <p className="text-center text-stone-500 text-sm py-4">
              No context items found. Add some on the Context page.
            </p>
          )}
          {!isLoading && !error && items.length > 0 && (
            <ScrollArea className="h-[300px] border rounded-md">
              <div className="p-2 space-y-1">
                {filteredItems.length > 0 ? (
                  filteredItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setSelectedItemId(item.id === selectedItemId ? null : item.id)}
                      className={`w-full flex items-center justify-between text-left p-2 rounded-md text-sm transition-colors ${ selectedItemId === item.id 
                          ? 'bg-stone-100 ring-1 ring-stone-300' 
                          : 'hover:bg-stone-50'
                      }`}
                    >
                      <div className="flex-1 overflow-hidden">
                        <p className="font-medium text-stone-800 truncate">{item.name}</p>
                        <p className="text-stone-500 truncate mt-0.5">{item.content}</p>
                      </div>
                      {selectedItemId === item.id && (
                        <Check className="h-4 w-4 text-black ml-2 flex-shrink-0" strokeWidth={2} />
                      )}
                    </button>
                  ))
                ) : (
                   <p className="text-center text-stone-500 text-sm py-4">
                    No items match your search.
                  </p>
                )}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button 
            onClick={handleConfirmAdd}
            disabled={isLoading || !hasChanged}
          >
            {selectedItemId ? "Add Selected Context" : attachedContextItemId ? "Remove Context" : "Select Context"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 