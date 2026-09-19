'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getCurrentUser, logout, User } from '@/lib/auth';
import { isSuperAdmin } from '@/lib/plan';
import { Menu, PanelLeftOpen, LogOut } from 'lucide-react';
import AppSidebar from '@/components/AppSidebar';

/**
 * The app shell: sidebar + topbar + auth gate, shared by every authenticated
 * route so the navigation never disappears.
 *
 * - default  → padded, scrollable content (list / detail / form pages)
 * - fullBleed → full-height, no padding (chat & document viewers that manage
 *   their own scroll)
 */
export default function AppShell({
  children,
  fullBleed = false,
}: {
  children: React.ReactNode;
  fullBleed?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sidebar-collapsed') === 'true';
    }
    return false;
  });

  useEffect(() => {
    getCurrentUser().then((u) => {
      if (!u) { router.push('/login'); return; }
      if (isSuperAdmin(u) && !pathname.startsWith('/dashboard/admin')) {
        router.push('/dashboard/admin');
        return;
      }
      setUser(u);
      setLoading(false);
    });
  }, [router, pathname]);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const toggleCollapse = () => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-canvas">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted">Loading ResearchMind…</p>
        </div>
      </div>
    );
  }

  const superAdmin = isSuperAdmin(user);

  return (
    <div className="flex h-screen bg-canvas overflow-hidden">
      {/* Desktop sidebar — slides fully in/out. Hidden for super admins, who only get the admin console. */}
      {!superAdmin && (
        <div className={`hidden lg:block flex-shrink-0 overflow-hidden transition-[width] duration-200 ${collapsed ? 'w-0' : 'w-60'}`}>
          <AppSidebar user={user} onToggle={toggleCollapse} />
        </div>
      )}

      {/* Mobile overlay */}
      {!superAdmin && mobileOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
          <div className="fixed top-0 left-0 h-full z-50 lg:hidden shadow-2xl">
            <AppSidebar user={user} onToggle={() => {}} onClose={() => setMobileOpen(false)} showClose />
          </div>
        </>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar — mobile hamburger + desktop open button when collapsed */}
        <div className="flex items-center gap-2 px-4 py-3 bg-surface border-b border-line flex-shrink-0 lg:h-14">
          {!superAdmin && (
            <button onClick={() => setMobileOpen(true)} className="lg:hidden text-muted hover:text-ink p-1">
              <Menu size={20} />
            </button>
          )}
          {!superAdmin && collapsed && (
            <button onClick={toggleCollapse} title="Open sidebar" className="hidden lg:flex items-center gap-2 text-muted hover:text-ink p-1 rounded-lg hover:bg-surface2 transition-colors">
              <PanelLeftOpen size={18} />
            </button>
          )}
          <span className="lg:hidden text-sm font-bold text-ink">ResearchMind AI</span>

          {superAdmin && (
            <button
              onClick={logout}
              title="Sign out"
              className="ml-auto flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink px-2.5 py-1.5 rounded-lg hover:bg-surface2 transition-colors"
            >
              <LogOut size={15} />
              Sign out
            </button>
          )}
        </div>

        {fullBleed ? (
          <div className="flex-1 overflow-hidden flex flex-col">{children}</div>
        ) : (
          <main className="flex-1 overflow-y-auto p-6 lg:p-8">{children}</main>
        )}
      </div>
    </div>
  );
}
