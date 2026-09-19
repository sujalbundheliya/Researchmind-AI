'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, X, Crown, Loader2, ArrowRight, ShieldCheck, CreditCard } from 'lucide-react';
import MarketingNav from '@/components/marketing/MarketingNav';
import MarketingFooter from '@/components/marketing/MarketingFooter';
import { PLAN_META, PLAN_ORDER, isSuperAdmin, isPaid } from '@/lib/plan';
import { getCurrentUser, User, PlanId } from '@/lib/auth';
import api from '@/lib/api';
import Toaster from '@/components/Toaster';
import { useToast } from '@/lib/toast';

interface ApiPlan {
  id: PlanId;
  name: string;
  priceLabel: string;
  features: string[];
}

/** Card data: backend catalog when available, PLAN_META as fallback. */
function usePlans() {
  const [plans, setPlans] = useState<ApiPlan[]>(PLAN_ORDER.map(id => PLAN_META[id]));
  useEffect(() => {
    api.get<{ plans: ApiPlan[] }>('/billing/plans')
      .then(res => {
        const byId = new Map(res.data.plans.map(p => [p.id, p]));
        if (PLAN_ORDER.every(id => byId.has(id))) {
          setPlans(PLAN_ORDER.map(id => byId.get(id)!));
        }
      })
      .catch(() => { /* keep the PLAN_META fallback */ });
  }, []);
  return plans;
}

// ── Comparison table ────────────────────────────────────────────────
function CompareCell({ val }: { val: boolean | string }) {
  return (
    <td className="px-4 py-3.5 text-center">
      {typeof val === 'boolean'
        ? val
          ? <div className="inline-flex w-6 h-6 rounded-full bg-success/15 items-center justify-center"><Check size={13} className="text-success" /></div>
          : <div className="inline-flex w-6 h-6 rounded-full bg-danger/10 items-center justify-center"><X size={13} className="text-danger/70" /></div>
        : <span className="text-xs text-muted">{val}</span>
      }
    </td>
  );
}

const COMPARISON_ROWS: { feature: string; free: boolean | string; individual: boolean | string; pro: boolean | string }[] = [
  { feature: 'Chat & Q&A with your papers', free: 'Unlimited', individual: 'Unlimited', pro: 'Unlimited' },
  { feature: 'PDF uploads', free: '5 (lifetime)', individual: 'Unlimited', pro: 'Unlimited' },
  { feature: 'Storage', free: '200 MB', individual: '5 GB', pro: '50 GB' },
  { feature: 'Data extraction tables', free: '1', individual: 'Unlimited', pro: 'Unlimited' },
  { feature: 'Systematic reviews', free: '1', individual: 'Unlimited', pro: 'Unlimited' },
  { feature: 'AI drafts', free: '1', individual: 'Unlimited', pro: 'Unlimited' },
  { feature: 'Citation generation (5 styles)', free: true, individual: true, pro: true },
  { feature: 'Key findings & research-gap analysis', free: true, individual: true, pro: true },
  { feature: 'Zotero import', free: false, individual: false, pro: true },
  { feature: 'Shared workspaces', free: false, individual: false, pro: 'Coming soon' },
];

const FAQS = [
  {
    q: 'Can I try ResearchMind before paying?',
    a: 'Yes — the Free plan needs no credit card and includes unlimited chat with up to 5 uploaded papers, plus one systematic review, one extraction table, and one AI draft to try every core tool.',
  },
  {
    q: 'How do payments work?',
    a: 'Subscriptions are billed monthly and processed securely by Stripe. We never see or store your card details.',
  },
  {
    q: 'Can I cancel or change plans anytime?',
    a: 'Yes. You can upgrade, downgrade, or cancel from your billing page at any time. When you cancel, you keep paid access until the end of the current billing period.',
  },
  {
    q: 'What happens to my documents if I downgrade?',
    a: 'Your documents and past work stay in your account. Free-plan limits apply to new activity going forward, not to what you already created.',
  },
  {
    q: 'Is my research private?',
    a: 'Yes. Your uploaded papers are private to your account, are never shared with other users, and are never used to train any model.',
  },
];

// ── Page content ────────────────────────────────────────────────────
export default function PricingContent() {
  const router = useRouter();
  const { toasts, toast, removeToast } = useToast();
  const plans = usePlans();
  const [user, setUser] = useState<User | null>(null);
  const [userLoaded, setUserLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    getCurrentUser().then(u => { setUser(u); setUserLoaded(true); });
  }, []);

  const admin = isSuperAdmin(user);
  const paid = isPaid(user) && !admin;
  const currentPlan: PlanId | null = user ? user.plan : null;

  const startCheckout = async (plan: PlanId) => {
    setBusy(plan);
    try {
      const res = await api.post<{ url: string }>('/billing/checkout', { plan });
      window.location.href = res.data.url;
    } catch (e: any) {
      toast(e.response?.data?.message || 'Could not start checkout', 'error');
      setBusy(null);
    }
  };

  const handleSelect = (plan: PlanId) => {
    if (!user) {
      router.push('/register');
      return;
    }
    if (plan === 'free' || paid) {
      // Downgrades and changes to an existing subscription are managed in-app.
      router.push('/dashboard/billing');
      return;
    }
    startCheckout(plan);
  };

  const ctaLabel = (plan: PlanId): string => {
    if (!userLoaded) return '…';
    if (!user) return plan === 'free' ? 'Start for free' : `Get ${PLAN_META[plan].name}`;
    if (admin) return 'Included';
    if (plan === currentPlan) return 'Current plan';
    if (paid) return 'Manage in billing';
    return plan === 'free' ? 'Current plan' : `Upgrade to ${PLAN_META[plan].name}`;
  };

  const ctaDisabled = (plan: PlanId): boolean =>
    !userLoaded || admin || (!!user && plan === currentPlan) || (!!user && !paid && plan === 'free');

  return (
    <div className="bg-canvas text-ink min-h-screen">
      <MarketingNav />

      {/* ── HERO ─────────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-14 px-6 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-clay/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative max-w-3xl mx-auto text-center">
          <p className="text-clay font-semibold text-sm uppercase tracking-widest mb-3">Pricing</p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-5">
            Simple pricing for serious research
          </h1>
          <p className="text-lg text-muted leading-relaxed">
            Start free with no credit card. Upgrade when your library grows. Cancel anytime.
          </p>
        </div>
      </section>

      {/* ── PLAN CARDS ───────────────────────────────────────────── */}
      <section className="px-6 pb-20">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-3 gap-5">
            {plans.map((plan) => {
              const meta = PLAN_META[plan.id];
              const isCurrent = !!user && plan.id === currentPlan && !admin;
              return (
                <div key={plan.id}
                  className={`relative bg-surface rounded-2xl border p-7 flex flex-col ${
                    isCurrent ? 'border-clay ring-1 ring-clay' : meta.highlighted ? 'border-clay/60 shadow-lg shadow-clay/10' : 'border-line'
                  }`}>
                  {meta.highlighted && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-clay text-white">
                      Most popular
                    </span>
                  )}

                  <div className="flex items-center gap-2 mb-1">
                    {plan.id === 'pro' && <Crown size={16} className="text-clay" />}
                    <h2 className="text-lg font-bold text-ink">{plan.name}</h2>
                    {isCurrent && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-clay/15 text-clay border border-clay/30">
                        Your plan
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted mb-4">{meta.tagline}</p>
                  <p className="text-4xl font-bold text-ink mb-6">
                    {plan.priceLabel.split('/')[0]}
                    {plan.priceLabel.includes('/') && <span className="text-sm font-normal text-subtle">/month</span>}
                  </p>

                  <ul className="space-y-2.5 mb-7 flex-1">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-ink">
                        <Check size={16} className="text-clay flex-shrink-0 mt-0.5" /> {f}
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => handleSelect(plan.id)}
                    disabled={ctaDisabled(plan.id) || busy === plan.id}
                    className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
                      ctaDisabled(plan.id)
                        ? 'bg-surface2 text-muted cursor-default'
                        : meta.highlighted || plan.id === 'pro'
                          ? 'bg-clay text-white hover:bg-clay-hover shadow-lg shadow-clay/20'
                          : 'border border-line text-ink hover:bg-surface2'
                    }`}>
                    {busy === plan.id ? <Loader2 size={15} className="animate-spin" /> : null}
                    {ctaLabel(plan.id)}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-8 flex flex-col items-center gap-3 text-center">
            {user && (
              <Link href="/dashboard/billing" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink transition-colors">
                <CreditCard size={14} /> Manage your subscription <ArrowRight size={13} />
              </Link>
            )}
            <p className="inline-flex items-center gap-1.5 text-xs text-subtle">
              <ShieldCheck size={13} className="text-success" /> Payments are processed securely by Stripe. Cancel anytime.
            </p>
          </div>
        </div>
      </section>

      {/* ── COMPARISON TABLE ─────────────────────────────────────── */}
      <section className="px-6 py-20 bg-surface/60 border-y border-line">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-ink text-center mb-12">Compare plans in detail</h2>
          <div className="rounded-2xl overflow-hidden border border-line overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="bg-surface">
                  <th className="px-4 py-4 text-left text-sm text-muted font-medium w-2/5">Feature</th>
                  <th className="px-4 py-4 text-center text-sm text-ink font-semibold w-1/5">Free</th>
                  <th className="px-4 py-4 text-center w-1/5">
                    <div className="bg-clay text-white text-xs font-bold px-3 py-1 rounded-full inline-block">Individual</div>
                  </th>
                  <th className="px-4 py-4 text-center text-sm text-ink font-semibold w-1/5">Pro</th>
                </tr>
              </thead>
              <tbody className="bg-canvas">
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.feature} className="border-b border-line last:border-b-0 hover:bg-surface2/60 transition-colors">
                    <td className="px-4 py-3.5 text-sm text-muted">{row.feature}</td>
                    <CompareCell val={row.free} />
                    <CompareCell val={row.individual} />
                    <CompareCell val={row.pro} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────── */}
      <section className="px-6 py-20">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-ink text-center mb-12">Frequently asked questions</h2>
          <div className="space-y-4">
            {FAQS.map(({ q, a }) => (
              <div key={q} className="bg-surface border border-line rounded-2xl p-6">
                <h3 className="text-ink font-semibold mb-2">{q}</h3>
                <p className="text-muted text-sm leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────── */}
      <section className="px-6 pb-24">
        <div className="max-w-3xl mx-auto text-center">
          <div className="relative">
            <div className="absolute inset-0 bg-clay/10 blur-3xl rounded-full" />
            <div className="relative bg-gradient-to-b from-surface to-canvas border border-line rounded-3xl p-12">
              <h2 className="text-3xl font-bold text-ink mb-4">Ready to speed up your research?</h2>
              <p className="text-muted text-lg mb-8">
                Join for free and upload your first paper in minutes. No credit card required.
              </p>
              <Link href={user ? '/dashboard' : '/register'}
                className="inline-flex items-center justify-center gap-2 bg-clay hover:bg-clay-hover text-white font-bold px-8 py-4 rounded-xl transition-all text-base shadow-xl shadow-clay/20 hover:-translate-y-0.5">
                {user ? 'Go to your workspace' : 'Get started free'} <ArrowRight size={18} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <MarketingFooter />
      <Toaster toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
