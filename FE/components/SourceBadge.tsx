import { Source } from '@/lib/hooks/useChat';

interface SourceBadgeProps {
  sources: Source[];
}

export default function SourceBadge({ sources }: SourceBadgeProps) {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-3">
      <span className="text-xs text-subtle self-center">Sources:</span>
      {sources.map((source, i) => {
        const name = source.doc_name.length > 28
          ? source.doc_name.slice(0, 28) + '…'
          : source.doc_name;
        // A page number makes the citation checkable — without one the reader has
        // no place to look to verify the claim.
        const page = source.page_number ? ` · p.${source.page_number}` : '';
        return (
          <span
            key={i}
            title={source.page_number ? `${source.doc_name} — page ${source.page_number}` : source.doc_name}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-surface2 text-muted border border-line hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-colors cursor-default"
          >
            <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {name}{page}
          </span>
        );
      })}
    </div>
  );
}
