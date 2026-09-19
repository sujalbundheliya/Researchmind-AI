'use client';

import { useState, useCallback } from 'react';
import { useDropzone, FileRejection } from 'react-dropzone';
import { Upload, Link2, Loader2, ArrowRight } from 'lucide-react';
import api from '@/lib/api';

interface FileUploaderProps {
  onUploadSuccess: (doc: Record<string, unknown>) => void;
  workspaceId?: string;
}

type Mode = 'file' | 'url';

export default function FileUploader({ onUploadSuccess, workspaceId }: FileUploaderProps) {
  const [mode, setMode] = useState<Mode>('file');

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileIndex, setFileIndex] = useState(0);
  const [fileCount, setFileCount] = useState(0);
  const [error, setError] = useState('');

  // URL mode
  const [url, setUrl] = useState('');
  const [fetching, setFetching] = useState(false);

  const onDrop = useCallback(
    async (accepted: File[], rejected: FileRejection[]) => {
      setError('');

      if (rejected.length > 0) {
        const msg = rejected[0].errors[0]?.message ?? 'Invalid file';
        setError(msg.includes('20971520') ? 'File exceeds 20MB limit' : msg);
        return;
      }
      if (accepted.length === 0) return;

      setUploading(true);
      setFileCount(accepted.length);

      for (let i = 0; i < accepted.length; i++) {
        const file = accepted[i];
        setFileIndex(i + 1);
        setProgress(0);

        const formData = new FormData();
        formData.append('file', file);
        if (workspaceId) formData.append('workspace_id', workspaceId);

        try {
          const res = await api.post('/documents/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (e) => {
              if (e.total) setProgress(Math.round((e.loaded / e.total) * 100));
            },
          });
          onUploadSuccess(res.data);
        } catch (err: unknown) {
          const axiosErr = err as { response?: { status?: number; data?: { message?: string; code?: string } } };
          if (axiosErr.response?.data?.code === 'UPGRADE_REQUIRED') {
            setError(axiosErr.response.data.message || 'Upgrade your plan to upload more PDFs.');
            break; // stop the batch — remaining files would fail the same way
          } else if (axiosErr.response?.status === 413) {
            setError('Storage quota exceeded. Please delete some documents first.');
          } else {
            setError(`${file.name}: ${axiosErr.response?.data?.message ?? 'Upload failed. Please try again.'}`);
          }
        }
      }

      setUploading(false);
      setProgress(0);
      setFileIndex(0);
      setFileCount(0);
    },
    [onUploadSuccess, workspaceId]
  );

  /**
   * URL mode. The server does the fetching (with SSRF and size checks), so
   * there is no upload progress to report — just a single pending state that
   * covers download + queueing for ingestion.
   */
  const handleUrlSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');

      const trimmed = url.trim();
      if (!trimmed) {
        setError('Paste a link to a PDF first.');
        return;
      }
      if (!/^https?:\/\//i.test(trimmed)) {
        setError('The link must start with http:// or https://');
        return;
      }

      setFetching(true);
      try {
        const res = await api.post('/documents/upload-url', {
          url: trimmed,
          ...(workspaceId && { workspace_id: workspaceId }),
        });
        onUploadSuccess(res.data);
        setUrl('');
      } catch (err: unknown) {
        const axiosErr = err as { response?: { status?: number; data?: { message?: string; code?: string } } };
        if (axiosErr.response?.status === 413) {
          setError('Storage quota exceeded. Please delete some documents first.');
        } else {
          // URL_FETCH_FAILED and UPGRADE_REQUIRED both carry a usable message.
          setError(axiosErr.response?.data?.message ?? 'Could not fetch that link. Please try again.');
        }
      } finally {
        setFetching(false);
      }
    },
    [url, workspaceId, onUploadSuccess]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxSize: 20 * 1024 * 1024,
    disabled: uploading,
  });

  const busy = uploading || fetching;

  return (
    <div>
      {/* Mode switch */}
      <div className="inline-flex p-0.5 mb-3 rounded-lg bg-surface2 border border-line">
        {([
          { id: 'file' as Mode, label: 'Upload file', icon: Upload },
          { id: 'url' as Mode, label: 'From link', icon: Link2 },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => { setMode(id); setError(''); }}
            disabled={busy}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50 ${
              mode === id ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
            }`}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {mode === 'file' ? (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
            isDragActive
              ? 'border-clay bg-blue-50'
              : 'border-line hover:border-clay hover:bg-blue-50/30'
          } ${uploading ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          <input {...getInputProps()} />

          <div className="flex flex-col items-center gap-3">
            <svg
              className={`w-10 h-10 ${isDragActive ? 'text-clay' : 'text-subtle'}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>

            {uploading ? (
              <div className="w-full max-w-xs">
                <p className="text-sm text-muted mb-2">
                  {fileCount > 1
                    ? `Uploading ${fileIndex} of ${fileCount}... ${progress}%`
                    : `Uploading... ${progress}%`}
                </p>
                <div className="h-1.5 bg-line rounded-full overflow-hidden">
                  <div
                    className="h-full bg-clay rounded-full transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            ) : isDragActive ? (
              <p className="text-sm text-clay font-medium">Drop the PDF here</p>
            ) : (
              <>
                <p className="text-sm text-muted">
                  <span className="font-medium text-clay">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-subtle">PDF only · Max 20MB</p>
              </>
            )}
          </div>
        </div>
      ) : (
        <form
          onSubmit={handleUrlSubmit}
          className="border-2 border-dashed border-line rounded-xl p-8 text-center"
        >
          <div className="flex flex-col items-center gap-3">
            <Link2 className={`w-10 h-10 ${fetching ? 'text-clay' : 'text-subtle'}`} strokeWidth={1.5} />

            {fetching ? (
              <div className="flex items-center gap-2 text-sm text-muted">
                <Loader2 size={15} className="animate-spin text-clay" />
                Downloading and processing…
              </div>
            ) : (
              <>
                <p className="text-sm text-muted">Paste a direct link to a PDF</p>
                <div className="w-full max-w-md flex gap-2">
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://arxiv.org/pdf/1706.03762"
                    className="flex-1 px-3.5 py-2.5 rounded-lg bg-canvas border border-line text-sm text-ink placeholder:text-subtle focus:outline-none focus:border-clay focus:ring-2 focus:ring-clay/20 transition-colors"
                  />
                  <button
                    type="submit"
                    disabled={!url.trim()}
                    className="flex items-center gap-1.5 bg-clay text-white text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-clay-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                  >
                    Fetch <ArrowRight size={14} />
                  </button>
                </div>
                <p className="text-xs text-subtle">
                  arXiv abstract pages and Google Drive share links work too — we&apos;ll find the PDF. Max 20MB.
                </p>
              </>
            )}
          </div>
        </form>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
