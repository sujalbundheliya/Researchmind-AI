'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, LayoutDashboard } from 'lucide-react';
import Logo from '@/components/Logo';
import ThemeToggle from '@/components/ThemeToggle';
import { getCurrentUser, User } from '@/lib/auth';

/**
 * Shared top navigation for the public marketing pages (/, /pricing, /contact).
 *
 * The right-hand CTA is auth-aware: a signed-in visitor who lands here (footer
 * link, logo click, bookmark) gets a way back into the app instead of a "Sign
 * in" button that makes it look like their session was dropped. `undefined`
 * means "not checked yet" — the slot stays empty for that first tick rather
 * than flashing the wrong state.
 */
export default function MarketingNav() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    getCurrentUser().then(setUser);
  }, []);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-line bg-canvas/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href={user ? '/dashboard' : '/'} className="hover:opacity-80 transition-opacity">
          <Logo size={32} />
        </Link>

        <div className="hidden md:flex items-center gap-8 text-sm text-muted">
          <a href="/#features" className="hover:text-ink transition-colors">Features</a>
          <a href="/#how-it-works" className="hover:text-ink transition-colors">How it works</a>
          <a href="/#compare" className="hover:text-ink transition-colors">Compare</a>
          <Link href="/pricing" className="hover:text-ink transition-colors">Pricing</Link>
          <Link href={user ? '/dashboard/support' : '/contact'} className="hover:text-ink transition-colors">Contact</Link>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle className="w-9 h-9" />

          {user === undefined ? (
            // Auth state unknown — reserve the space, commit to nothing.
            <div className="h-9 w-32" aria-hidden="true" />
          ) : user ? (
            <Link href="/dashboard"
              className="flex items-center gap-1.5 text-sm font-semibold bg-clay text-white px-4 py-2 rounded-lg hover:bg-clay-hover transition-colors shadow-lg shadow-clay/20">
              <LayoutDashboard size={14} /> Dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="text-sm text-muted hover:text-ink transition-colors px-3 py-2">
                Sign in
              </Link>
              <Link href="/register"
                className="flex items-center gap-1.5 text-sm font-semibold bg-clay text-white px-4 py-2 rounded-lg hover:bg-clay-hover transition-colors shadow-lg shadow-clay/20">
                Get started free <ArrowRight size={14} />
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
