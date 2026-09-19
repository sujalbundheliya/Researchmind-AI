'use client';

import { useRef, useEffect, useState } from 'react';
import { SendHorizontal } from 'lucide-react';
import MessageBubble from './MessageBubble';
import { LogoIcon } from '@/components/Logo';
import { Message } from '@/lib/hooks/useChat';

interface ChatInterfaceProps {
  messages: Message[];
  isLoading: boolean;
  error: string;
  onSend: (question: string) => void;
  disabled?: boolean;
}

export default function ChatInterface({ messages, isLoading, error, onSend, disabled = false }: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || disabled) return;
    onSend(input.trim());
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e as unknown as React.FormEvent); }
  };

  return (
    <div className="flex flex-col h-full bg-surface">

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-12 h-12 mb-5 rounded-2xl flex items-center justify-center shadow-md overflow-hidden bg-clay-tint border-2 border-clay">
              <LogoIcon size={36} />
            </div>
            <h2 className="text-base font-semibold text-ink mb-1.5">Ask about your research</h2>
            <p className="text-sm text-subtle max-w-xs leading-relaxed">
              Answers are grounded strictly in your uploaded papers — no hallucinations.
            </p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto w-full px-4 py-6 space-y-1">
            {messages.map(msg => <MessageBubble key={msg.id} message={msg} />)}
            {isLoading && (
              <div className="flex gap-3 py-3">
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm overflow-hidden bg-clay-tint border-[1.5px] border-clay">
                  <LogoIcon size={20} />
                </div>
                <div className="flex items-center gap-1.5 pt-1.5">
                  {[0, 150, 300].map(d => (
                    <span key={d} className="w-2 h-2 rounded-full bg-clay animate-bounce" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="max-w-2xl mx-auto w-full px-4 mb-2">
          <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs text-red-600">{error}</p>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-4 pb-4 pt-3 border-t border-linesoft bg-surface flex-shrink-0">
        <div className="max-w-2xl mx-auto">
          <form onSubmit={handleSubmit}>
            <div className={`flex items-end gap-2 bg-canvas border rounded-2xl px-4 py-2.5 transition-all shadow-sm ${
              disabled ? 'opacity-60' : 'border-line focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-50 focus-within:bg-surface'
            }`}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onInput={e => {
                  const t = e.currentTarget;
                  t.style.height = 'auto';
                  t.style.height = `${Math.min(t.scrollHeight, 120)}px`;
                }}
                placeholder={disabled ? 'Select documents to start chatting…' : 'Ask a question about your documents…'}
                rows={1}
                disabled={isLoading || disabled}
                className="flex-1 resize-none bg-transparent text-sm text-ink placeholder-subtle focus:outline-none disabled:cursor-not-allowed min-h-[28px] max-h-[120px] leading-relaxed py-0.5"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading || disabled}
                className="flex-shrink-0 w-8 h-8 bg-clay hover:bg-clay-hover text-white rounded-xl flex items-center justify-center active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-sm mb-0.5"
              >
                <SendHorizontal size={14} />
              </button>
            </div>
          </form>
          <p className="text-[11px] text-subtle mt-2 text-center">
            Enter to send · Shift+Enter for new line · Grounded in your docs only
          </p>
        </div>
      </div>

    </div>
  );
}
