'use client';

import { useState } from 'react';
import { RotateCw, Pencil } from 'lucide-react';

interface CellData {
  value: string;
  confidence: 'high' | 'medium' | 'low' | 'verified';
  page?: number | null;
  chunk_id?: string | null;
  source_text?: string | null;
  edited?: boolean;
}

interface Row {
  id: string;
  document_id: string;
  doc_name: string;
  data: Record<string, CellData>;
}

interface Column {
  name: string;
  description: string;
}

interface ExtractionTableProps {
  columns: Column[];
  rows: Row[];
  onReExtract?: (row: Row) => Promise<void>;
  onEditCell?: (row: Row, column: string, value: string) => Promise<void>;
}

interface CellDetail {
  row: Row;
  colName: string;
  cell: CellData;
}

const CONFIDENCE_BG: Record<string, string> = {
  high: 'bg-green-50 text-green-800',
  medium: 'bg-yellow-50 text-yellow-800',
  low: 'bg-red-50 text-red-800',
  verified: 'bg-blue-50 text-blue-800',
};

const isEmptyCell = (data?: CellData) => !data || data.value === 'Not reported';

function Cell({ data, onClick }: { data?: CellData; onClick: () => void }) {
  const empty = isEmptyCell(data);
  const conf = data?.confidence || 'medium';
  const style = empty ? 'bg-canvas' : (CONFIDENCE_BG[conf] || CONFIDENCE_BG.medium);

  return (
    <td className={`px-3 py-2 text-xs border-b border-line ${style} max-w-xs`}>
      <button
        type="button"
        onClick={onClick}
        title="Click to view source or correct this value"
        className="flex items-start justify-between gap-1 text-left w-full cursor-pointer group/cell"
      >
        {empty ? (
          <span className="text-subtle italic group-hover/cell:underline decoration-dotted underline-offset-2">Not reported</span>
        ) : (
          <span className="line-clamp-3 group-hover/cell:underline decoration-dotted underline-offset-2">{data!.value}</span>
        )}
        <span className="flex items-center gap-1 flex-shrink-0 ml-1">
          {data?.edited && <Pencil size={9} className="opacity-50" />}
          {!empty && data?.page != null && <span className="text-xs opacity-60">p.{data.page}</span>}
        </span>
      </button>
    </td>
  );
}

export default function ExtractionTable({ columns, rows, onReExtract, onEditCell }: ExtractionTableProps) {
  const [detail, setDetail] = useState<CellDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [filterLow, setFilterLow] = useState(false);
  const [busyRowId, setBusyRowId] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-subtle text-sm">
        No data extracted yet. Use the <span className="font-medium text-clay">Extract</span> button to populate this table.
      </div>
    );
  }

  const lowCount = rows.reduce(
    (acc, r) => acc + Object.values(r.data || {}).filter(c => c?.confidence === 'low').length,
    0,
  );
  const displayRows = filterLow
    ? rows.filter(r => Object.values(r.data || {}).some(c => c?.confidence === 'low'))
    : rows;

  const openDetail = (row: Row, colName: string, cell: CellData) => {
    setDetail({ row, colName, cell });
    setDraft(cell.value === 'Not reported' ? '' : cell.value);
    setEditing(false);
  };

  const saveEdit = async () => {
    if (!detail || !onEditCell) return;
    setSaving(true);
    try {
      await onEditCell(detail.row, detail.colName, draft);
      setDetail(null);
    } catch {
      /* keep modal open on failure */
    } finally {
      setSaving(false);
    }
  };

  const reExtract = async (row: Row) => {
    if (!onReExtract) return;
    setBusyRowId(row.document_id);
    try {
      await onReExtract(row);
    } catch {
      /* surfaced via parent */
    } finally {
      setBusyRowId(null);
    }
  };

  return (
    <>
      {/* Review filter */}
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div className="inline-flex rounded-lg border border-line overflow-hidden text-xs">
          <button
            onClick={() => setFilterLow(false)}
            className={`px-3 py-1.5 font-medium ${!filterLow ? 'bg-clay text-white' : 'text-muted hover:bg-surface2'}`}
          >
            All ({rows.length})
          </button>
          <button
            onClick={() => setFilterLow(true)}
            disabled={lowCount === 0}
            className={`px-3 py-1.5 font-medium border-l border-line ${filterLow ? 'bg-clay text-white' : 'text-muted hover:bg-surface2'} disabled:text-subtle disabled:cursor-not-allowed`}
          >
            Needs review ({lowCount})
          </button>
        </div>
      </div>

      <div className="overflow-auto border border-line rounded-xl">
        <table className="w-full text-left border-collapse min-w-max">
          <thead>
            <tr className="bg-clay text-white">
              <th className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap border-r border-white/20 sticky left-0 z-20 bg-clay">
                Document
              </th>
              {columns.map((col) => (
                <th key={col.name} className="px-3 py-2.5 text-xs font-semibold whitespace-nowrap border-r border-white/20" title={col.description}>
                  {col.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row) => (
              <tr key={row.id} className="hover:bg-surface2 group">
                <td className="px-3 py-2 text-xs font-medium text-ink border-b border-r border-line whitespace-nowrap sticky left-0 z-10 bg-surface max-w-[200px]">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate flex-1" title={row.doc_name}>{row.doc_name}</span>
                    {onReExtract && (
                      <button
                        type="button"
                        onClick={() => reExtract(row)}
                        disabled={busyRowId === row.document_id}
                        title="Re-extract this paper"
                        className="flex-shrink-0 p-1 rounded text-subtle hover:text-clay hover:bg-blue-50 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-100"
                      >
                        <RotateCw size={12} className={busyRowId === row.document_id ? 'animate-spin' : ''} />
                      </button>
                    )}
                  </div>
                </td>
                {columns.map((col) => (
                  <Cell
                    key={col.name}
                    data={row.data?.[col.name]}
                    onClick={() => openDetail(row, col.name, row.data?.[col.name] || { value: 'Not reported', confidence: 'low' })}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex items-center gap-4 p-3 border-t border-line bg-canvas text-xs text-muted flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-green-100 border border-green-300" />High confidence
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-yellow-100 border border-yellow-300" />Medium
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-red-100 border border-red-300" />Low
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-blue-100 border border-blue-300" />Verified
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded bg-surface2 border border-line" />Not reported
          </div>
          <span className="text-subtle ml-auto">Click any cell to view its source or correct it</span>
        </div>
      </div>

      {/* Cell detail / edit modal */}
      {detail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => !saving && setDetail(null)}>
          <div className="bg-surface rounded-2xl w-full max-w-lg shadow-xl flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between p-5 border-b border-line">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-ink">{detail.colName}</h3>
                <p className="text-xs text-subtle mt-0.5 truncate" title={detail.row.doc_name}>{detail.row.doc_name}</p>
              </div>
              <button onClick={() => setDetail(null)} className="text-subtle hover:text-ink text-2xl leading-none flex-shrink-0">×</button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {editing ? (
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-subtle mb-1">Corrected value</label>
                  <textarea
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    rows={3}
                    autoFocus
                    placeholder="Type the correct value…"
                    className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-clay resize-y"
                  />
                  <div className="flex items-center justify-end gap-2 mt-3">
                    <button onClick={() => setEditing(false)} disabled={saving} className="px-3 py-1.5 text-xs text-muted hover:text-ink">Cancel</button>
                    <button onClick={saveEdit} disabled={saving} className="px-3 py-1.5 bg-clay text-white rounded-lg text-xs font-medium hover:bg-clay-hover disabled:opacity-40">
                      {saving ? 'Saving…' : 'Save correction'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={`text-sm font-semibold ${isEmptyCell(detail.cell) ? 'text-subtle italic' : 'text-ink'}`}>{detail.cell.value}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CONFIDENCE_BG[detail.cell.confidence] || CONFIDENCE_BG.medium}`}>
                      {detail.cell.confidence === 'verified' ? 'verified by you' : `${detail.cell.confidence} confidence`}
                    </span>
                    {detail.cell.page != null && !isEmptyCell(detail.cell) && (
                      <span className="text-xs text-subtle">page {detail.cell.page}</span>
                    )}
                    {onEditCell && (
                      <button onClick={() => setEditing(true)} className="ml-auto flex items-center gap-1 text-xs font-medium text-clay hover:underline">
                        <Pencil size={12} /> Edit value
                      </button>
                    )}
                  </div>

                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-subtle mb-1">Source passage</p>
                    {detail.cell.source_text ? (
                      <blockquote className="text-sm text-muted leading-relaxed bg-canvas border-l-2 border-clay rounded-r-lg p-3 whitespace-pre-wrap">
                        {detail.cell.source_text}
                      </blockquote>
                    ) : (
                      <p className="text-sm text-subtle italic">No source passage recorded for this cell.</p>
                    )}
                  </div>

                  {detail.cell.chunk_id && (
                    <p className="text-[10px] text-subtle font-mono">chunk: {detail.cell.chunk_id}</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
