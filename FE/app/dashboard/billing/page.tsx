'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getCurrentUser, invalidateUserCache, User, PlanId } from '@/lib/auth';
import { PLAN_META, PLAN_ORDER, isSuperAdmin, isPaid } from '@/lib/plan';
import api from '@/lib/api';
import Toaster from '@/components/Toaster';
import { useToast } from '@/lib/toast';
import { Check, Crown, Loader2, Shield, CreditCard } from 'lucide-react';

function BillingInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { toasts, toast, removeToast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    invalidateUserCache();
    setUser(await getCurrentUser());
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const status = params.get('status');
    if (status === 'success') {
      // Reconcile the subscription immediately (works even without a webhook),
      // then refresh the cached user so the new plan shows right away.
      (async () => {
        toast('Payment successful — activating your plan…');
        try { await api.post('/billing/sync'); } catch { /* webhook will catch up */ }
        invalidateUserCache();
        await load();
        router.replace('/dashboard/billing');
      })();
    } else if (status === 'cancel') {
      toast('Checkout canceled', 'error');
      router.replace('/dashboard/billing');
    }
  }, [params, toast, load, router]);

  const currentPlan: PlanId = user?.plan ?? 'free';
  const admin = isSuperAdmin(user);
  const paid = isPaid(user) && !admin;

  const startCheckout = async (plan: string) => {
    setBusy(plan);
    try {
      const res = await api.post<{ url: string }>('/billing/checkout', { plan });
      window.location.href = res.data.url;
    } catch (e: any) {
      toast(e.response?.data?.message || 'Could not start checkout', 'error');
      setBusy(null);
    }
  };

  // Change an EXISTING subscription in place (paid ↔ paid, or cancel to free).
  const changePlan = async (plan: string) => {
    if (plan === 'free' && !window.confirm('Cancel your subscription? You keep access until the end of the current billing period, then revert to Free.')) {
      return;
    }
    setBusy(plan);
    try {
      const res = await api.post<{ changed: boolean; message?: string }>('/billing/change-plan', { plan });
      toast(res.data.message || 'Plan updated');
      invalidateUserCache();
      await load();
    } catch (e: any) {
      // No live subscription to modify → fall back to a fresh checkout.
      if (e.response?.status === 409 && e.response?.data?.needsCheckout) {
        return startCheckout(plan);
      }
      toast(e.response?.data?.message || 'Could not change plan', 'error');
    } finally {
      setBusy(null);
    }
  };

  const openPortal = async () => {
    setBusy('portal');
    try {
      const res = await api.post<{ url: string }>('/billing/portal');
      window.location.href = res.data.url;
    } catch (e: any) {
      toast(e.response?.data?.message || 'Could not open billing portal', 'error');
      setBusy(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink">Plans & Billing</h1>
        <p className="text-muted text-sm mt-1">
          {admin ? (
            <span className="inline-flex items-center gap-1.5"><Shield size={14} className="text-clay" /> Super Admin — full access to every feature.</span>
          ) : (
            <>You&apos;re on the <span className="font-semibold text-ink">{PLAN_META[currentPlan].name}</span> plan.</>
          )}
          {user?.plan_renews_at && paid && (
            <span className="text-subtle"> · renews {new Date(user.plan_renews_at).toLocaleDateString()}</span>
          )}
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        {PLAN_ORDER.map((planId) => {
          const meta = PLAN_META[planId];
          const isCurrent = planId === currentPlan && !admin;
          const featured = meta.highlighted && !isCurrent;
          // For a paid user, a paid card is either an upgrade or a downgrade.
          const isUpgrade = PLAN_ORDER.indexOf(planId) > PLAN_ORDER.indexOf(currentPlan);

          return (
            <div
              key={planId}
              className={`relative bg-surface rounded-2xl border p-6 flex flex-col ${
                isCurrent ? 'border-clay ring-1 ring-clay' : featured ? 'border-clay/50' : 'border-line'
              }`}
            >
              {meta.highlighted && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-clay text-white">
                  Most popular
                </span>
              )}

              <div className="flex items-center gap-2 mb-1">
                {planId === 'pro' && <Crown size={16} className="text-clay" />}
                <h2 className="text-lg font-bold text-ink">{meta.name}</h2>
              </div>
              <p className="text-xs text-muted mb-3">{meta.tagline}</p>
              <p className="text-3xl font-bold text-ink mb-5">
                {meta.priceLabel.split('/')[0]}
                {meta.priceLabel.includes('/') && <span className="text-sm font-normal text-subtle">/mo</span>}
              </p>

              <ul className="space-y-2.5 mb-6 flex-1">
                {meta.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-ink">
                    <Check size={16} className="text-clay flex-shrink-0 mt-0.5" /> {f}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              {isCurrent ? (
                <button disabled className="w-full py-2.5 rounded-xl text-sm font-semibold bg-surface2 text-muted cursor-default">
                  Current plan
                </button>
              ) : admin ? (
                <button disabled className="w-full py-2.5 rounded-xl text-sm font-semibold bg-surface2 text-muted cursor-default">
                  Included
                </button>
              ) : planId === 'free' ? (
                paid ? (
                  <button onClick={() => changePlan('free')} disabled={busy === 'free'}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold border border-line text-ink hover:bg-surface2 transition-colors flex items-center justify-center gap-2">
                    {busy === 'free' ? <Loader2 size={15} className="animate-spin" /> : null} Cancel subscription
                  </button>
                ) : (
                  <button disabled className="w-full py-2.5 rounded-xl text-sm font-semibold bg-surface2 text-muted cursor-default">
                    Current plan
                  </button>
                )
              ) : paid ? (
                <button onClick={() => changePlan(planId)} disabled={busy === planId}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold bg-clay text-white hover:bg-clay-hover transition-colors flex items-center justify-center gap-2">
                  {busy === planId ? <Loader2 size={15} className="animate-spin" /> : <CreditCard size={15} />} {isUpgrade ? `Upgrade to ${meta.name}` : `Switch to ${meta.name}`}
                </button>
              ) : (
                <button onClick={() => startCheckout(planId)} disabled={busy === planId}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold bg-clay text-white hover:bg-clay-hover transition-colors flex items-center justify-center gap-2">
                  {busy === planId ? <Loader2 size={15} className="animate-spin" /> : null} Upgrade to {meta.name}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {paid && (
        <div className="mt-6 text-center">
          <button onClick={openPortal} disabled={busy === 'portal'}
            className="text-sm text-muted hover:text-ink inline-flex items-center gap-1.5">
            <CreditCard size={14} /> Manage billing, invoices & payment method
          </button>
        </div>
      )}

      <p className="mt-8 text-center text-xs text-subtle">
        Payments are processed securely by Stripe. Test mode — use card 4242 4242 4242 4242.
      </p>

      <Toaster toasts={toasts} onRemove={removeToast} />
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="animate-spin text-clay" /></div>}>
      <BillingInner />
    </Suspense>
  );
}
