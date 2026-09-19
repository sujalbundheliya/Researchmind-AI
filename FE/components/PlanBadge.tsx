'use client';

import { User } from '@/lib/auth';
import { planLabel, isSuperAdmin } from '@/lib/plan';
import { Crown, Shield } from 'lucide-react';

/**
 * Small current-plan pill. Styled for the dark (espresso) sidebar footer.
 */
export default function PlanBadge({ user }: { user: User | null }) {
  if (!user) return null;
  const admin = isSuperAdmin(user);
  const pro = user.plan === 'pro';

  const style = admin
    ? 'bg-clay text-white'
    : pro
    ? 'bg-clay/20 text-clay'
    : 'bg-cream/10 text-cream/60';

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${style}`}>
      {admin ? <Shield size={10} /> : pro ? <Crown size={10} /> : null}
      {planLabel(user)}
    </span>
  );
}
