'use client';

import { useState, useCallback } from 'react';
import { useDropzone, FileRejection } from 'react-dropzone';
import api from '@/lib/api';

interface ImportResult {
  imported: number;
  skipped_duplicates: number;
  pending_pdf_upload: number;
  linked_existing: number;
  failed: number;
}

interface ZoteroImportProps {
  onImportComplete?: () => void;
}

export default function ZoteroImport({ onImportComplete }: ZoteroImportProps) {
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');

  const onDrop = useCallback(async (accepted: File[], rejected: FileRejection[]) => {
    setError('');
    setResult(null);

    if (rejected.length > 0) {
      setError('Only .ris and .bib files are accepted');
      return;
    }
    if (accepted.length === 0) return;

    const file = accepted[0];
    const formData = new FormData();
    formData.append('file', file);

    setImporting(true);
    try {
      const res = await api.post<ImportResult>('/zotero/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(res.data);
      if (onImportComplete) onImportComplete();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg || 'Import failed. Please try again.');
    } finally {
      setImporting(false);
    }
  }, [onImportComplete]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/octet-stream': ['.ris', '.bib'], 'text/plain': ['.ris', '.bib'] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
    disabled: importing,
  });

  return (
    <div className="bg-surface rounded-xl border border-line p-5">
      <h3 className="text-sm font-semibold text-ink mb-1">Import from Zotero</h3>
      <p className="text-xs text-subtle mb-4">Upload a .ris or .bib export file from Zotero</p>

      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-clay bg-blue-50' : 'border-line hover:border-clay hover:bg-blue-50/20'
        } ${importing ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <input {...getInputProps()} />
        {importing ? (
          <div className="flex items-center justify-center gap-2 text-muted text-sm">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-clay" />
            Importing…
          </div>
        ) : isDragActive ? (
          <p className="text-sm text-clay font-medium">Drop your Zotero export here</p>
        ) : (
          <>
            <p className="text-sm text-muted">
              <span className="font-medium text-clay">Click to upload</span> or drag and drop
            </p>
            <p className="text-xs text-subtle mt-1">.ris or .bib · Max 10MB</p>
          </>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {result && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-xl text-sm">
          <p className="font-semibold text-green-800 mb-2">Import complete</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted">Imported:</span>
              <span className="font-medium text-green-700">{result.imported}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Duplicates skipped:</span>
              <span className="font-medium text-muted">{result.skipped_duplicates}</span>
            </div>
            {result.linked_existing > 0 && (
              <div className="flex justify-between">
                <span className="text-muted">Linked to existing:</span>
                <span className="font-medium text-green-700">{result.linked_existing}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted">Need PDF upload:</span>
              <span className="font-medium text-yellow-600">{result.pending_pdf_upload}</span>
            </div>
            {result.failed > 0 && (
              <div className="flex justify-between">
                <span className="text-muted">Failed:</span>
                <span className="font-medium text-red-600">{result.failed}</span>
              </div>
            )}
          </div>
          {result.linked_existing > 0 && (
            <p className="mt-2 text-xs text-green-700">
              {result.linked_existing} matched a PDF you&apos;ve already uploaded — citations were added to those documents.
            </p>
          )}
          {result.pending_pdf_upload > 0 && (
            <p className="mt-2 text-xs text-yellow-700">
              {result.pending_pdf_upload} paper{result.pending_pdf_upload !== 1 ? 's' : ''} imported with metadata only — upload PDFs from the dashboard to enable Q&amp;A.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
