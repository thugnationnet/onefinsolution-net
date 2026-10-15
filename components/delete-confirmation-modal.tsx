'use client';

import React from 'react';
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

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  itemTitle: string | null;
  onConfirmDelete: () => void;
  isDeleting: boolean;
}

export function DeleteConfirmationModal({
  isOpen,
  setIsOpen,
  itemTitle,
  onConfirmDelete,
  isDeleting
}: DeleteConfirmationModalProps) {

  const handleOpenChange = (open: boolean) => {
    if (!isDeleting) {
      setIsOpen(open);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Delete Item</DialogTitle>
          <DialogDescription>
            Permanently delete &ldquo;{itemTitle || 'this item'}&rdquo;? This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={isDeleting}>
              Cancel
            </Button>
          </DialogClose>
          <Button 
            variant="destructive" 
            onClick={onConfirmDelete} 
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 