'use client';

import React, { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import api from '@/lib/api';

interface Draft {
  id: string;
  title: string;
  content: string;
  mode: string;
  document_ids: string[];
  created_at: string;
}

interface DraftEditorProps {
  draft: Draft;
  onUpdate: (content: string) => void;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Wrap any bare `[UNSUPPORTED]` tokens that appear inside a set of rendered
 * children in a highlighted span, leaving all other markdown formatting intact.
 */
function highlightUnsupported(children: React.ReactNode): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (typeof child !== 'string') return child;
    const parts = child.split(/(\[UNSUPPORTED\])/g);
    return parts.map((part, i) =>
      part === '[UNSUPPORTED]' ? (
        <span
          key={i}
          className="bg-red-50 text-red-700 font-semibold px-1 py-0.5 rounded border border-red-200"
        >
          [UNSUPPORTED]
        </span>
      ) : (
        <React.Fragment key={i}>{part}</React.Fragment>
      )
    );
  });
}

const mdComponents = {
  p: ({ children }: { children?: React.ReactNode }) => <p>{highlightUnsupported(children)}</p>,
  li: ({ children }: { children?: React.ReactNode }) => <li>{highlightUnsupported(children)}</li>,
  h1: ({ children }: { children?: React.ReactNode }) => <h1>{highlightUnsupported(children)}</h1>,
  h2: ({ children }: { children?: React.ReactNode }) => <h2>{highlightUnsupported(children)}</h2>,
  h3: ({ children }: { children?: React.ReactNode }) => <h3>{highlightUnsupported(children)}</h3>,
  td: ({ children }: { children?: React.ReactNode }) => <td>{highlightUnsupported(children)}</td>,
};

const PROSE_CLASSES = `
  prose prose-sm max-w-none text-ink
  prose-p:my-3 prose-p:leading-7 prose-p:text-ink
  prose-headings:font-semibold prose-headings:text-ink prose-headings:tracking-tight
  prose-h1:text-xl prose-h1:mt-6 prose-h1:mb-3
  prose-h2:text-lg prose-h2:mt-6 prose-h2:mb-2.5
  prose-h3:text-base prose-h3:mt-5 prose-h3:mb-2
  prose-strong:font-semibold prose-strong:text-ink
  prose-a:text-clay prose-a:no-underline hover:prose-a:underline
  prose-ul:my-3 prose-ol:my-3 prose-li:my-1 prose-li:text-ink
  prose-blockquote:border-l-clay prose-blockquote:text-muted prose-blockquote:font-normal prose-blockquote:not-italic
  prose-code:text-clay prose-code:bg-clay-tint prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono prose-code:before:content-[''] prose-code:after:content-['']
  prose-pre:bg-canvas prose-pre:border prose-pre:border-line prose-pre:rounded-xl
  prose-hr:border-line
`;

function MarkdownPreview({ content }: { content: string }) {
  return (
    <div className={PROSE_CLASSES}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{content}</ReactMarkdown>
    </div>
  );
}

export default function DraftEditor({ draft, onUpdate }: DraftEditorProps) {
  const [content, setContent] = useState(draft.content);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const unsupportedCount = content.split('[UNSUPPORTED]').length - 1;
  const wordCount = countWords(content);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await api.patch(`/writing/drafts/${draft.id}`, { content });
      onUpdate(content);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      setEditing(false);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }, [draft.id, content, onUpdate]);

  const handleCancel = useCallback(() => {
    setContent(draft.content);
    setEditing(false);
  }, [draft.content]);

  const handleExport = () => {
    window.open(`${process.env.NEXT_PUBLIC_API_URL}/writing/drafts/${draft.id}/export`, '_blank');
  };

  const MODE_LABELS: Record<string, string> = {
    literature_review: 'Literature Review',
    abstract: 'Abstract',
    introduction: 'Introduction',
    discussion: 'Discussion',
    custom: 'Custom',
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 bg-surface border-b border-line flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-clay-tint text-clay">
            {MODE_LABELS[draft.mode] || draft.mode}
          </span>
          <span className="text-xs text-subtle tabular-nums">{wordCount} words</span>
          {unsupportedCount > 0 && (
            <span
              className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200"
              title="These claims could not be grounded in your documents"
            >
              ⚠ {unsupportedCount} unsupported claim{unsupportedCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button onClick={handleCancel} className="px-3 py-1.5 text-xs text-muted hover:text-ink transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3.5 py-1.5 bg-clay text-white rounded-lg text-xs font-medium hover:bg-clay-hover disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                className="px-3.5 py-1.5 text-xs border border-line text-muted rounded-lg hover:bg-surface2 hover:text-ink transition-colors"
              >
                Edit
              </button>
              <button
                onClick={handleExport}
                className="px-3.5 py-1.5 text-xs border border-clay text-clay rounded-lg hover:bg-clay-tint transition-colors"
              >
                Export .md
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      {editing ? (
        /* Split view: raw markdown source on the left, live preview on the right */
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-line overflow-hidden">
          <div className="flex flex-col overflow-hidden">
            <div className="px-6 py-2 border-b border-line bg-surface2 text-[11px] font-medium uppercase tracking-wide text-subtle flex-shrink-0">
              Markdown
            </div>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              spellCheck={false}
              className="flex-1 w-full p-6 text-sm text-ink bg-canvas focus:outline-none resize-none font-mono leading-6 overflow-y-auto"
            />
          </div>
          <div className="flex flex-col overflow-hidden">
            <div className="px-6 py-2 border-b border-line bg-surface2 text-[11px] font-medium uppercase tracking-wide text-subtle flex-shrink-0">
              Preview
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-surface">
              <MarkdownPreview content={content} />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto bg-canvas">
          <article className="max-w-3xl mx-auto px-6 py-8 md:py-10">
            <MarkdownPreview content={content} />
          </article>
        </div>
      )}
    </div>
  );
}
