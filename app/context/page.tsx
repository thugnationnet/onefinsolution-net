'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExclamationTriangleIcon, TrashIcon } from '@radix-ui/react-icons';
import { FileText, PlusCircle } from 'lucide-react';
import { getContextItems, ContextItem, deleteContextItem } from '@/app/actions';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { DeleteConfirmationModal } from "@/components/delete-confirmation-modal";
import { useAuth } from '@/lib/auth';

// Helper to format date strings
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
    return dateString; // Fallback to original string
  }
}

export default function ContextPage() {
  const router = useRouter();

  const [items, setItems] = useState<ContextItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();

  // Rename delete-related state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<ContextItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch initial items
  const fetchItems = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const fetchedItems = await getContextItems();
      setItems(fetchedItems);
    } catch (err) {
      console.error("Failed to fetch context items:", err);
      setError("Could not load context items. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Handle row click navigation
  const handleRowClick = (itemId: string) => {
    router.push(`/context/${itemId}`);
  };

  // Updated navigation handler with auth check
  const handleGoToAddPage = () => {
      if (isAuthLoading) return;
      if (isAuthenticated === false) {
          router.push('/sign-in');
          return;
      }
      if (isAuthenticated === true) {
          router.push('/context/new');
      }
  };

  // Function to open delete modal
  const openDeleteModal = (item: ContextItem) => {
    setItemToDelete(item);
    setIsDeleteDialogOpen(true);
  };

  // Renamed delete handler
  const handleDeleteItem = async () => {
    if (!itemToDelete || isDeleting) return;

    const deletedItemId = itemToDelete.id;
    setIsDeleting(true);
    setIsDeleteDialogOpen(false);

    try {
      const result = await deleteContextItem(deletedItemId);
      if (result.success) {
        // Update client-side state immediately
        setItems(prevItems => prevItems.filter(item => item.id !== deletedItemId));
        toast.success(`Item "${itemToDelete.name}" deleted.`);
        // No redirect needed here as we are on the list page
      } else {
        throw new Error(result.error || "Failed to delete item.");
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      console.error("Error deleting context item:", error);
      toast.error(message);
      setError(message); // Show error in list page if needed
    } finally {
      setIsDeleting(false);
      setItemToDelete(null);
    }
  };

  return (
    <div className="container max-w-5xl mx-auto py-10 px-4 md:px-6">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Manage Context</h1>
        <Button
            onClick={handleGoToAddPage}
            size="sm"
            className="flex items-center gap-2 h-8 px-4"
            disabled={isAuthLoading}
        >
            <PlusCircle className="h-4 w-4" />
            <span>Add New</span>
        </Button>
      </div>

      {/* Display Existing Items Table */}
      {isLoading && (
        <div className="space-y-1">
          <Skeleton className="h-9 w-full rounded-md" />
          <Skeleton className="h-9 w-full rounded-md" />
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
      )}
      {!isLoading && error && (
          <Alert variant="destructive">
            <ExclamationTriangleIcon className="h-4 w-4" />
            <AlertTitle>Loading Error</AlertTitle>
            <AlertDescription>{error || "Failed to load context items."}</AlertDescription>
          </Alert>
       )}
      {!isLoading && !error && (
        <div>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b-stone-200">
                <TableHead className="w-[40px] px-1 py-2"></TableHead>
                <TableHead className="w-[30%] px-3 py-2 text-xs font-medium text-stone-500 uppercase tracking-wider">Name</TableHead>
                <TableHead className="w-[45%] px-3 py-2 text-xs font-medium text-stone-500 uppercase tracking-wider">Content Snippet</TableHead>
                <TableHead className="w-[20%] px-3 py-2 text-xs font-medium text-stone-500 uppercase tracking-wider">Last Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow className="border-none">
                  <TableCell colSpan={4} className="h-24 text-center text-stone-500">
                    You haven&rsquo;t added any context items yet.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <TableRow
                    key={item.id}
                    className="group border-b border-stone-100 hover:bg-stone-50/50"
                  >
                    <TableCell className="px-1 py-1 align-middle">
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-stone-500 hover:text-red-600 hover:bg-red-100/50"
                            onClick={(e) => {
                                e.stopPropagation();
                                openDeleteModal(item);
                            }}
                        >
                           <TrashIcon className="h-4 w-4" />
                        </Button>
                    </TableCell>
                    <TableCell
                        className="font-medium px-3 py-2 align-middle text-sm flex items-center gap-2 cursor-pointer"
                        onClick={() => handleRowClick(item.id)}
                    >
                       <FileText className="h-4 w-4 text-stone-400 flex-shrink-0" />
                       <span>{item.name}</span>
                    </TableCell>
                    <TableCell
                        className="px-3 py-2 align-middle cursor-pointer"
                        onClick={() => handleRowClick(item.id)}
                    >
                      <p className="truncate max-w-md text-sm text-stone-600" title={item.content}>
                        {item.content}
                      </p>
                    </TableCell>
                    <TableCell
                        className="text-sm text-stone-500 px-3 py-2 align-middle cursor-pointer"
                        onClick={() => handleRowClick(item.id)}
                    >
                         {formatDate(item.updated_at)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
      <DeleteConfirmationModal
         isOpen={isDeleteDialogOpen}
         setIsOpen={setIsDeleteDialogOpen}
         itemTitle={itemToDelete?.name ?? null}
         onConfirmDelete={handleDeleteItem}
         isDeleting={isDeleting}
       />
    </div>
  );
}
