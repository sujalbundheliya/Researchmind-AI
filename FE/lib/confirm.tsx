'use client';

import { createContext, useContext, useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red, destructive styling for the confirm button. */
  danger?: boolean;
}

type Resolver = (ok: boolean) => void;

const ConfirmContext = createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolverRef = useRef<Resolver | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    setOpts(options);
    return new Promise<boolean>((resolve) => { resolverRef.current = resolve; });
  }, []);

  const settle = useCallback((ok: boolean) => {
    resolverRef.current?.(ok);
    resolverRef.current = null;
    setOpts(null);
  }, []);

  useEffect(() => {
    if (!opts) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') settle(false);
      if (e.key === 'Enter') settle(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [opts, settle]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 animate-[fadeSlideIn_0.15s_ease-out]"
          onClick={() => settle(false)}>
          <div role="dialog" aria-modal="true"
            className="bg-surface rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}>
            <div className="p-5">
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  opts.danger ? 'bg-red-50 text-red-500' : 'bg-clay/10 text-clay'
                }`}>
                  <AlertTriangle size={18} />
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <h3 className="text-base font-semibold text-ink leading-snug">{opts.title}</h3>
                  {opts.message && <p className="text-sm text-muted mt-1 leading-relaxed">{opts.message}</p>}
                </div>
                <button onClick={() => settle(false)} aria-label="Close"
                  className="text-subtle hover:text-ink w-7 h-7 flex items-center justify-center rounded-lg hover:bg-surface2 flex-shrink-0 -mt-1 -mr-1">
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3.5 bg-surface2/50 border-t border-line">
              <button onClick={() => settle(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-muted hover:text-ink hover:bg-surface2 transition-colors">
                {opts.cancelLabel || 'Cancel'}
              </button>
              <button autoFocus onClick={() => settle(true)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors shadow-sm ${
                  opts.danger ? 'bg-red-500 hover:bg-red-600' : 'bg-clay hover:bg-clay-hover'
                }`}>
                {opts.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider');
  return ctx;
}
