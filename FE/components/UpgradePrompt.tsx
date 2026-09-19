'use client';

import { useRouter } from 'next/navigation';
import { Sparkles, Check, LucideIcon } from 'lucide-react';

interface UpgradePromptProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  requiredPlan?: 'individual' | 'pro';
  bullets?: string[];
}

/**
 * Full-section upsell shown in place of a gated feature (Zotero, Workspaces) or
 * when a Free user has exhausted a one-time allowance.
 */
export default function UpgradePrompt({
  title,
  description,
  icon: Icon = Sparkles,
  requiredPlan = 'pro',
  bullets,
}: UpgradePromptProps) {
  const router = useRouter();
  const label = requiredPlan === 'pro' ? 'Pro feature' : 'Paid feature';

  return (
    <div className="max-w-2xl mx-auto text-center py-12">
      <div className="w-14 h-14 rounded-2xl bg-clay/10 text-clay flex items-center justify-center mx-auto mb-4">
        <Icon size={26} />
      </div>
      <span className="inline-block text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-clay/10 text-clay mb-3">
        {label}
      </span>
      <h1 className="text-2xl font-bold text-ink mb-2">{title}</h1>
      <p className="text-muted text-sm mb-6 max-w-md mx-auto">{description}</p>

      {bullets && bullets.length > 0 && (
        <ul className="text-left inline-block space-y-2 mb-8">
          {bullets.map((b) => (
            <li key={b} className="flex items-center gap-2 text-sm text-ink">
              <Check size={16} className="text-clay flex-shrink-0" /> {b}
            </li>
          ))}
        </ul>
      )}

      <div>
        <button
          onClick={() => router.push('/dashboard/billing')}
          className="px-5 py-2.5 bg-clay text-white rounded-xl text-sm font-semibold hover:bg-clay-hover transition-colors shadow-sm"
        >
          {requiredPlan === 'pro' ? 'Upgrade to Pro' : 'Upgrade'}
        </button>
      </div>
    </div>
  );
}
