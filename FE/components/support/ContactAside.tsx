import Link from 'next/link';
import { Mail, Clock, LifeBuoy, ArrowRight } from 'lucide-react';
import { CONTACT_EMAIL } from '@/lib/support';

interface ContactAsideProps {
  /** Where "plan limits & upgrades" should point — pricing publicly, billing in-app. */
  plansHref?: string;
  plansLabel?: string;
}

/** The three info cards beside the contact form. */
export default function ContactAside({
  plansHref = '/pricing',
  plansLabel = 'See plans & FAQ',
}: ContactAsideProps) {
  return (
    <div className="space-y-4">
      <div className="bg-surface border border-line rounded-2xl p-6">
        <div className="w-10 h-10 rounded-xl bg-clay/10 flex items-center justify-center text-clay mb-4">
          <Mail size={18} />
        </div>
        <h3 className="text-sm font-bold text-ink mb-1.5">Email us directly</h3>
        <p className="text-xs text-muted leading-relaxed mb-3">
          Prefer your own mail client? Write to us at:
        </p>
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-clay hover:underline break-all"
        >
          {CONTACT_EMAIL}
        </a>
      </div>

      <div className="bg-surface border border-line rounded-2xl p-6">
        <div className="w-10 h-10 rounded-xl bg-clay/10 flex items-center justify-center text-clay mb-4">
          <Clock size={18} />
        </div>
        <h3 className="text-sm font-bold text-ink mb-1.5">Response time</h3>
        <p className="text-xs text-muted leading-relaxed">
          We aim to reply to every message within <span className="text-ink font-medium">1–2 business days</span>.
          Billing and account issues are prioritised.
        </p>
      </div>

      <div className="bg-surface border border-line rounded-2xl p-6">
        <div className="w-10 h-10 rounded-xl bg-clay/10 flex items-center justify-center text-clay mb-4">
          <LifeBuoy size={18} />
        </div>
        <h3 className="text-sm font-bold text-ink mb-1.5">Before you write</h3>
        <p className="text-xs text-muted leading-relaxed mb-3">
          Plan limits, storage and upgrade questions are usually answered on the pricing page.
        </p>
        <Link href={plansHref} className="inline-flex items-center gap-1 text-xs font-semibold text-clay hover:underline">
          {plansLabel} <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  );
}
