'use client';

import { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, XCircle, Loader2, RefreshCw, Database, Cpu, Settings2, Clock } from 'lucide-react';
import api from '@/lib/api';
import { SystemHealth } from './types';

function StatusDot({ ok }: { ok: boolean }) {
  return ok
    ? <CheckCircle2 size={16} className="text-success flex-shrink-0" />
    : <XCircle size={16} className="text-danger flex-shrink-0" />;
}

function ConfigRow({ label, ok, hint }: { label: string; ok: boolean; hint?: string }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-linesoft last:border-0">
      <StatusDot ok={ok} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-ink">{label}</p>
        {hint && <p className="text-xs text-subtle mt-0.5">{hint}</p>}
      </div>
      <span className={`text-xs font-medium ${ok ? 'text-success' : 'text-subtle'}`}>
        {ok ? 'Configured' : 'Not set'}
      </span>
    </div>
  );
}

export default function SystemTab({ toast }: { toast: (msg: string, type?: 'success' | 'error') => void }) {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const res = await api.get<SystemHealth>('/admin/system');
      setHealth(res.data);
    } catch {
      toast('Could not load system status', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-clay" /></div>;
  }
  if (!health) return null;

  const { database, aiService, config } = health;

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <p className="text-xs text-subtle">
          Environment: <span className="font-medium text-muted">{config.nodeEnv}</span>
        </p>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs font-medium text-muted border border-line px-3 py-1.5 rounded-lg hover:text-ink hover:bg-surface2 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Services */}
      <div className="bg-surface border border-line rounded-xl p-5">
        <h2 className="text-sm font-bold text-ink mb-4 flex items-center gap-2">
          <Cpu size={15} className="text-clay" /> Services
        </h2>

        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-canvas border border-line">
            <Database size={16} className="text-muted flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink">PostgreSQL</p>
              <p className="text-xs text-subtle flex items-center gap-1">
                <Clock size={10} /> {database.latencyMs} ms
              </p>
            </div>
            <StatusDot ok={database.ok} />
          </div>

          <div className="flex items-center gap-3 p-3 rounded-lg bg-canvas border border-line">
            <Cpu size={16} className="text-muted flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink">AI service (FastAPI)</p>
              <p className="text-xs text-subtle flex items-center gap-1 truncate">
                <Clock size={10} /> {aiService.latencyMs} ms
                {aiService.url && <span className="truncate"> · {aiService.url}</span>}
              </p>
              {aiService.error && (
                <p className="text-xs text-danger mt-0.5 truncate">{aiService.error}</p>
              )}
            </div>
            <StatusDot ok={aiService.ok} />
          </div>
        </div>
      </div>

      {/* Configuration */}
      <div className="bg-surface border border-line rounded-xl p-5">
        <h2 className="text-sm font-bold text-ink mb-1 flex items-center gap-2">
          <Settings2 size={15} className="text-clay" /> Configuration
        </h2>
        <p className="text-xs text-subtle mb-3">
          Shows whether each secret is present — never its value.
        </p>

        <div>
          <ConfigRow label="Stripe secret key" ok={config.stripeSecretKey} />
          <ConfigRow label="Stripe price — Individual" ok={config.stripePriceIndividual} />
          <ConfigRow label="Stripe price — Pro" ok={config.stripePricePro} />
          <ConfigRow
            label="Stripe webhook secret"
            ok={config.stripeWebhookSecret}
            hint="Only needed for renewals and portal cancellations — upgrades reconcile via /billing/sync."
          />
          <ConfigRow label="Google OAuth" ok={config.googleOauth} />
          <ConfigRow
            label="SMTP (outbound email)"
            ok={config.smtp}
            hint={config.smtp
              ? `Contact messages are emailed to ${config.contactEmail}.`
              : `Contact messages are stored in the Messages tab only — set SMTP_* in BE/.env to also email ${config.contactEmail}.`}
          />
        </div>

        <div className="mt-4 pt-4 border-t border-linesoft flex items-center justify-between text-xs">
          <span className="text-muted">Max upload size</span>
          <span className="font-medium text-ink">{config.maxFileSizeMb} MB</span>
        </div>
      </div>
    </div>
  );
}
