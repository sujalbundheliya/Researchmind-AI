'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, X } from 'lucide-react';

/**
 * Global listener for `rm:upgrade-required` events dispatched by the axios
 * interceptor (lib/api.ts) whenever the backend returns a 403 UPGRADE_REQUIRED.
 * Mounted once in the root layout so any gated action shows an upgrade nudge.
 */
export default function UpgradeToast() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setMessage(detail?.message || 'Upgrade your plan to use this feature.');
    };
    window.addEventListener('rm:upgrade-required', handler);
    return () => window.removeEventListener('rm:upgrade-required', handler);
  }, []);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 9000);
    return () => clearTimeout(t);
  }, [message]);

  if (!message) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] max-w-sm bg-espresso text-cream rounded-xl shadow-2xl border border-clay/40 p-4 flex gap-3">
      <Sparkles size={18} className="text-clay flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-sm font-medium leading-snug">{message}</p>
        <button
          onClick={() => { setMessage(null); router.push('/dashboard/billing'); }}
          className="mt-2.5 text-xs font-semibold px-3 py-1.5 bg-clay text-white rounded-lg hover:bg-clay-hover transition-colors"
        >
          View plans
        </button>
      </div>
      <button onClick={() => setMessage(null)} className="text-cream/50 hover:text-cream flex-shrink-0">
        <X size={15} />
      </button>
    </div>
  );
}
