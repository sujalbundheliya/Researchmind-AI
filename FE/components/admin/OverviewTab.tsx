'use client';

import {
  Users, DollarSign, FileText, FlaskConical, Table2, FileEdit,
  MessageSquare, TrendingUp, HardDrive, Link2, AlertTriangle, Loader2,
} from 'lucide-react';
import { AdminStats, formatBytes } from './types';

function StatCard({ icon, label, value, hint, tone = 'default' }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'default' | 'warning' | 'danger';
}) {
  const iconTone =
    tone === 'danger' ? 'bg-danger/10 text-danger'
    : tone === 'warning' ? 'bg-warning/10 text-warning'
    : 'bg-clay/10 text-clay';

  return (
    <div className="bg-surface rounded-xl border border-line p-4">
      <div className={`w-9 h-9 rounded-lg ${iconTone} flex items-center justify-center mb-3`}>{icon}</div>
      <p className="text-2xl font-bold text-ink leading-none">{value}</p>
      <p className="text-xs text-muted mt-1.5">{label}</p>
      {hint && <p className="text-[11px] text-subtle mt-0.5">{hint}</p>}
    </div>
  );
}

export default function OverviewTab({ stats }: { stats: AdminStats | null }) {
  if (!stats) {
    return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-clay" /></div>;
  }

  const { documents, signups, content, messages, byPlan } = stats;

  return (
    <div className="space-y-6">
      {/* Accounts & revenue */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-subtle mb-3">Accounts</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard icon={<Users size={16} />} label="Total users" value={stats.totalUsers} />
          <StatCard icon={<Users size={16} />} label="Free" value={byPlan.free} />
          <StatCard icon={<Users size={16} />} label="Individual" value={byPlan.individual} />
          <StatCard icon={<Users size={16} />} label="Pro" value={byPlan.pro} />
          <StatCard icon={<DollarSign size={16} />} label="MRR" value={`$${stats.mrr}`} />
        </div>
      </section>

      {/* Growth */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-subtle mb-3">Growth</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={<TrendingUp size={16} />} label="New sign-ups" hint="last 7 days" value={signups.last_7d} />
          <StatCard icon={<TrendingUp size={16} />} label="New sign-ups" hint="last 30 days" value={signups.last_30d} />
          <StatCard
            icon={<MessageSquare size={16} />}
            label="Unread messages"
            hint={`${messages.total} total`}
            value={messages.unread}
            tone={messages.unread > 0 ? 'warning' : 'default'}
          />
          <StatCard icon={<HardDrive size={16} />} label="Storage used" hint="across all accounts" value={formatBytes(documents.totalBytes)} />
        </div>
      </section>

      {/* Documents */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-subtle mb-3">Documents</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard icon={<FileText size={16} />} label="Total" value={documents.total} />
          <StatCard icon={<FileText size={16} />} label="Ready" value={documents.ready} />
          <StatCard icon={<Loader2 size={16} />} label="Processing" value={documents.processing} tone={documents.processing > 0 ? 'warning' : 'default'} />
          <StatCard icon={<AlertTriangle size={16} />} label="Failed" value={documents.failed} tone={documents.failed > 0 ? 'danger' : 'default'} />
          <StatCard icon={<Link2 size={16} />} label="From a link" value={documents.fromUrl} />
        </div>
        {documents.failed > 0 && (
          <p className="text-xs text-muted mt-2.5 flex items-center gap-1.5">
            <AlertTriangle size={12} className="text-danger" />
            {documents.failed} document{documents.failed === 1 ? '' : 's'} failed to process — retry from the Documents tab.
          </p>
        )}
      </section>

      {/* Research output */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-subtle mb-3">Research output</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={<FlaskConical size={16} />} label="Systematic reviews" value={content.reviews} />
          <StatCard icon={<Table2 size={16} />} label="Extraction tables" value={content.extraction_tables} />
          <StatCard icon={<FileEdit size={16} />} label="AI drafts" value={content.drafts} />
          <StatCard icon={<MessageSquare size={16} />} label="Chat sessions" value={content.chat_sessions} />
        </div>
      </section>
    </div>
  );
}
