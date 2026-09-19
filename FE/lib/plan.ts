import { User, PlanId } from './auth';

/**
 * Frontend mirror of the backend plan gates (BE/src/config/plans.js).
 * Single place the UI reads plan/role capabilities from. The backend is always
 * the real enforcer — these helpers just drive what we show and enable.
 */

export const FREE_UPLOAD_LIMIT = 5;

export interface PlanMeta {
  id: PlanId;
  name: string;
  priceLabel: string;
  tagline: string;
  features: string[];
  highlighted?: boolean;
}

export const PLAN_META: Record<PlanId, PlanMeta> = {
  free: {
    id: 'free',
    name: 'Free',
    priceLabel: '$0',
    tagline: 'Try the core tools',
    features: [
      '5 PDF uploads (lifetime)',
      'Unlimited chat & Q&A',
      '1 data extraction table',
      '1 systematic review',
      '1 AI draft',
    ],
  },
  individual: {
    id: 'individual',
    name: 'Individual',
    priceLabel: '$15/mo',
    tagline: 'For solo researchers',
    highlighted: true,
    features: [
      'Unlimited PDF uploads',
      'Unlimited chat & Q&A',
      'Unlimited data extraction',
      'Unlimited systematic reviews',
      'Unlimited AI drafts',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceLabel: '$49/mo',
    tagline: 'For teams & power users',
    features: [
      'Everything in Individual',
      'Zotero import',
      'Shared workspaces & collaboration',
      '50 GB storage',
    ],
  },
};

export const PLAN_ORDER: PlanId[] = ['free', 'individual', 'pro'];

export function isSuperAdmin(u?: User | null): boolean {
  return u?.role === 'super_admin';
}
export function isPro(u?: User | null): boolean {
  return u?.plan === 'pro' || isSuperAdmin(u);
}
export function isPaid(u?: User | null): boolean {
  return u?.plan === 'individual' || u?.plan === 'pro' || isSuperAdmin(u);
}
export const canUseZotero = isPro;
// Workspaces shipped in M4 as a Pro feature (super admins included via isPro).
export const canUseWorkspaces = isPro;

type OneTimeFeature = 'extraction' | 'review' | 'draft';

/** Whether the user may still CREATE another of a one-time feature. */
export function canCreate(u: User | null | undefined, feature: OneTimeFeature): boolean {
  if (!u) return false;
  if (isSuperAdmin(u) || u.plan !== 'free') return true;
  const used =
    feature === 'extraction' ? u.extractions_used
    : feature === 'review' ? u.reviews_used
    : u.drafts_used;
  return (used || 0) < 1;
}

/** Remaining free uploads, or null when unlimited (paid / super admin). */
export function uploadsRemaining(u?: User | null): number | null {
  if (!u) return null;
  if (isSuperAdmin(u) || u.plan !== 'free') return null;
  return Math.max(0, FREE_UPLOAD_LIMIT - (u.lifetime_uploads || 0));
}

export function planLabel(u?: User | null): string {
  if (!u) return '';
  if (isSuperAdmin(u)) return 'Super Admin';
  return PLAN_META[u.plan]?.name ?? 'Free';
}
