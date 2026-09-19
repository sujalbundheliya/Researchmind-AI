import Link from 'next/link';
import Logo from '@/components/Logo';

/** Shared footer for the public marketing pages (/ and /pricing). */
export default function MarketingFooter() {
  return (
    <footer className="border-t border-line py-12 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          <div className="col-span-2 md:col-span-1">
            <Logo size={28} className="mb-4" />
            <p className="text-subtle text-sm leading-relaxed">
              AI-powered research workspace for scholars. Private, grounded, collaborative.
            </p>
          </div>
          <div>
            <h4 className="text-ink font-semibold text-sm mb-4">Product</h4>
            <ul className="space-y-2">
              <li><a href="/#features" className="text-subtle hover:text-ink text-sm transition-colors">Features</a></li>
              <li><a href="/#how-it-works" className="text-subtle hover:text-ink text-sm transition-colors">How it works</a></li>
              <li><a href="/#compare" className="text-subtle hover:text-ink text-sm transition-colors">Compare</a></li>
              <li><Link href="/pricing" className="text-subtle hover:text-ink text-sm transition-colors">Pricing</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-ink font-semibold text-sm mb-4">Account</h4>
            <ul className="space-y-2">
              <li><Link href="/login" className="text-subtle hover:text-ink text-sm transition-colors">Sign in</Link></li>
              <li><Link href="/register" className="text-subtle hover:text-ink text-sm transition-colors">Create account</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-ink font-semibold text-sm mb-4">Company</h4>
            <ul className="space-y-2">
              <li><Link href="/contact" className="text-subtle hover:text-ink text-sm transition-colors">Contact us</Link></li>
              <li>
                <a href="mailto:researchmind.ai.team@gmail.com" className="text-subtle hover:text-ink text-sm transition-colors break-all">
                  researchmind.ai.team@gmail.com
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-line pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-subtle text-sm">© 2026 ResearchMind AI. All rights reserved.</p>
          <p className="text-subtle text-sm">Built for researchers, by researchers.</p>
        </div>
      </div>
    </footer>
  );
}
