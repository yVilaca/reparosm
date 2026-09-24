'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type NoticeTone = 'info' | 'success' | 'error';
type Notice = { id: number; message: string; tone: NoticeTone };
type PendingConfirmation = {
  message: string;
  resolve: (confirmed: boolean) => void;
};
type FeedbackContextValue = {
  notify: (message: string, tone?: NoticeTone) => void;
  confirm: (message: string) => Promise<boolean>;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const noticeId = useRef(0);

  const notify = useCallback((message: string, tone: NoticeTone = 'info') => {
    noticeId.current += 1;
    setNotice({ id: noticeId.current, message, tone });
  }, []);

  const confirm = useCallback(
    (message: string) =>
      new Promise<boolean>((resolve) => {
        setPending({ message, resolve });
      }),
    [],
  );

  const resolveConfirmation = useCallback((confirmed: boolean) => {
    setPending((current) => {
      current?.resolve(confirmed);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (!pending) return;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        resolveConfirmation(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pending, resolveConfirmation]);

  return (
    <FeedbackContext.Provider value={{ notify, confirm }}>
      {children}
      <div className="toast-region" aria-live="polite" aria-atomic="true">
        {notice && (
          <div className={`toast toast-${notice.tone}`} key={notice.id} role="status">
            <span>{notice.message}</span>
            <button type="button" aria-label="Fechar notificação" onClick={() => setNotice(null)}>
              ×
            </button>
          </div>
        )}
      </div>
      {pending && (
        <div className="feedback-dialog-backdrop">
          <section
            className="feedback-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-dialog-title"
          >
            <h2 id="feedback-dialog-title">Confirme esta ação</h2>
            <p>{pending.message}</p>
            <div className="feedback-dialog-actions">
              <button ref={cancelRef} type="button" onClick={() => resolveConfirmation(false)}>
                Cancelar
              </button>
              <button className="danger" type="button" onClick={() => resolveConfirmation(true)}>
                Confirmar
              </button>
            </div>
          </section>
        </div>
      )}
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error('useFeedback precisa estar dentro de FeedbackProvider.');
  return context;
}
