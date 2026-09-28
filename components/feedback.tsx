'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Toaster } from '@/components/ui/sonner';
import { createConfirmationQueue } from './feedback-confirmation-queue.mjs';

type NoticeTone = 'info' | 'success' | 'error';
type PendingConfirmation = {
  id: number;
  message: string;
  resolve: (confirmed: boolean) => void;
};
type FeedbackContextValue = {
  notify: (message: string, tone?: NoticeTone) => void;
  confirm: (message: string) => Promise<boolean>;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const pendingQueue = useRef<ReturnType<typeof createConfirmationQueue> | null>(null);
  if (pendingQueue.current == null) pendingQueue.current = createConfirmationQueue(setPending);

  const notify = useCallback((message: string, tone: NoticeTone = 'info') => {
    if (tone === 'success') toast.success(message);
    else if (tone === 'error') toast.error(message);
    else toast(message);
  }, []);

  const confirm = useCallback(
    (message: string) =>
      new Promise<boolean>((resolve) => {
        pendingQueue.current!.enqueue(message, resolve);
      }),
    [],
  );

  const resolveConfirmation = useCallback((id: number, confirmed: boolean) => {
    pendingQueue.current?.resolve(id, confirmed);
  }, []);

  return (
    <FeedbackContext.Provider value={{ notify, confirm }}>
      {children}
      <Toaster richColors closeButton />
      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open && pending) resolveConfirmation(pending.id, false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirme esta ação</AlertDialogTitle>
            <AlertDialogDescription>{pending?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => pending && resolveConfirmation(pending.id, false)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => pending && resolveConfirmation(pending.id, true)}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error('useFeedback precisa estar dentro de FeedbackProvider.');
  return context;
}
