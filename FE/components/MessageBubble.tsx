import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import SourceBadge from './SourceBadge';
import { LogoIcon } from '@/components/Logo';
import { Message } from '@/lib/hooks/useChat';

interface MessageBubbleProps { message: Message; }

export default function MessageBubble({ message }: MessageBubbleProps) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end py-2">
        <div className="max-w-[75%] bg-clay text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm leading-relaxed">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 py-3">
      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm overflow-hidden bg-clay-tint border-[1.5px] border-clay">
        <LogoIcon size={20} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-ink leading-relaxed
          prose prose-sm max-w-none
          prose-p:my-1.5 prose-p:leading-relaxed
          prose-ul:my-1.5 prose-li:my-0.5
          prose-ol:my-1.5
          prose-strong:font-semibold prose-strong:text-ink
          prose-code:text-clay prose-code:bg-clay-tint prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono
          prose-pre:bg-canvas prose-pre:border prose-pre:border-line prose-pre:rounded-xl
          prose-headings:font-semibold prose-headings:text-ink prose-headings:mt-3
          prose-table:text-xs prose-th:text-ink prose-th:font-semibold prose-td:align-top">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        </div>
        {message.sources && message.sources.length > 0 && (
          <SourceBadge sources={message.sources} />
        )}
      </div>
    </div>
  );
}
