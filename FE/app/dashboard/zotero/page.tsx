'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser, User } from '@/lib/auth';
import { isPro } from '@/lib/plan';
import api from '@/lib/api';
import ZoteroImport from '@/components/ZoteroImport';
import UpgradePrompt from '@/components/UpgradePrompt';
import { Library, CheckCircle2, Clock, XCircle } from 'lucide-react';

interface ImportRecord {
  id: string;
  filename: string;
  status: string;
  imported_count: number;
  failed_count: number;
  created_at: string;
}

const STATUS: Record<string, { icon: React.ReactNode; cls: string; label: string }> = {
  completed: { icon: <CheckCircle2 size={14} />, cls: 'text-green-600', label: 'Completed' },
  processing: { icon: <Clock size={14} />, cls: 'text-yellow-600', label: 'Processing' },
  failed: { icon: <XCircle size={14} />, cls: 'text-red-500', label: 'Failed' },
};

export default function ZoteroPage() {
  const router = useRouter();
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  const load = useCallback(async () => {
    const u = await getCurrentUser();
    if (!u) { router.push('/login'); return; }
    setUser(u);
    if (!isPro(u)) { setLoading(false); return; } // Pro-only — skip the gated API call
    try {
      const res = await api.get<ImportRecord[]>('/zotero/imports');
      setImports(res.data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  if (user && !isPro(user)) {
    return (
      <UpgradePrompt
        icon={Library}
        requiredPlan="pro"
        title="Zotero Import is a Pro feature"
        description="Bring your entire Zotero reference library into ResearchMind. Upgrade to Pro to import .ris and .bib exports."
        bullets={['Import .ris & .bib libraries', 'Auto-match to your documents', 'Everything in Individual']}
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink">Zotero Import</h1>
        <p className="text-muted text-sm mt-1">Bring your reference library in from Zotero as .ris or .bib exports.</p>
      </div>

      <ZoteroImport onImportComplete={load} />

      {/* History */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold text-ink mb-3">Import History</h2>
        {loading ? (
          <div className="space-y-2">
            {[...Array(2)].map((_, i) => <div key={i} className="h-14 bg-surface rounded-xl border border-line animate-pulse" />)}
          </div>
        ) : imports.length === 0 ? (
          <div className="text-center py-10 border-2 border-dashed border-line rounded-xl bg-surface">
            <Library size={28} className="mx-auto text-subtle mb-2" />
            <p className="text-subtle text-sm">No imports yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {imports.map(imp => {
              const s = STATUS[imp.status] || STATUS.processing;
              return (
                <div key={imp.id} className="flex items-center gap-3 bg-surface border border-line rounded-xl px-4 py-3">
                  <span className={`flex items-center gap-1.5 text-xs font-medium flex-shrink-0 ${s.cls}`}>
                    {s.icon} {s.label}
                  </span>
                  <span className="flex-1 text-sm text-ink truncate">{imp.filename}</span>
                  <span className="text-xs text-subtle flex-shrink-0">
                    {imp.imported_count} imported
                    {imp.failed_count > 0 && <span className="text-red-500"> · {imp.failed_count} failed</span>}
                    {' · '}{new Date(imp.created_at).toLocaleDateString()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
