'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, FolderOpen, Building2, History,
  FlaskConical, Table2, FileEdit, Library,
  CreditCard, Shield, Crown, Lock, UserCircle, LifeBuoy,
  ChevronRight, LogOut, X, PanelLeftClose,
} from 'lucide-react';
import { User, logout } from '@/lib/auth';
import { isPro, isSuperAdmin } from '@/lib/plan';
import { LogoIcon } from '@/components/Logo';
import PlanBadge from '@/components/PlanBadge';

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact: boolean;
  proOnly?: boolean;
  comingSoon?: boolean; // locked on every tier (feature not shipped yet)
  adminOnly?: boolean;
};
type NavDivider = { divider: true; label: string };
type NavEntry = NavItem | NavDivider;

const NAV: NavEntry[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/workspace/all', label: 'All Documents', icon: FolderOpen, exact: false },
  { href: '/dashboard/workspaces', label: 'Workspaces', icon: Building2, exact: false, proOnly: true },
  { href: '/workspace/chat', label: 'History', icon: History, exact: false },
  { divider: true, label: 'Research Tools' },
  { href: '/dashboard/review', label: 'Systematic Review', icon: FlaskConical, exact: false },
  { href: '/dashboard/extraction', label: 'Data Extraction', icon: Table2, exact: false },
  { href: '/dashboard/drafts', label: 'AI Drafts', icon: FileEdit, exact: false },
  { href: '/dashboard/zotero', label: 'Zotero Import', icon: Library, exact: false, proOnly: true },
  { divider: true, label: 'Account' },
  { href: '/dashboard/profile', label: 'My Profile', icon: UserCircle, exact: false },
  { href: '/dashboard/billing', label: 'Plans & Billing', icon: CreditCard, exact: false },
  { href: '/dashboard/support', label: 'Contact Support', icon: LifeBuoy, exact: false },
  { href: '/dashboard/admin', label: 'Admin', icon: Shield, exact: false, adminOnly: true },
];

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

// The workspace list lives at /dashboard/workspaces, but opening one navigates
// to /workspaces/[id] — a different path prefix entirely. Without this, the
// "Workspaces" nav item goes dark (no active state) the moment you're actually
// inside a workspace, which is most of the time you'd be looking at the sidebar.
const WORKSPACES_HREF = '/dashboard/workspaces';
function isWorkspacesSection(pathname: string) {
  return pathname.startsWith('/dashboard/workspaces') || pathname.startsWith('/workspaces');
}

interface AppSidebarProps {
  user: User | null;
  onToggle: () => void;
  onClose?: () => void;
  showClose?: boolean;
}

export default function AppSidebar({ user, onToggle, onClose, showClose }: AppSidebarProps) {
  const pathname = usePathname();
  const superAdmin = isSuperAdmin(user);
  const pro = isPro(user);

  const isActive = (href: string, exact: boolean) =>
    href === WORKSPACES_HREF
      ? isWorkspacesSection(pathname)
      : exact ? pathname === href : pathname === href || pathname.startsWith(href + '/');

  return (
    <div className="flex flex-col h-full w-60 bg-espresso text-cream">
      {/* Logo row */}
      <div className="px-5 py-5 flex items-center justify-between border-b border-cream/10 flex-shrink-0">
        <Link href="/dashboard" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
          <LogoIcon size={34} />
          <div>
            <p className="text-sm font-bold leading-tight font-serif">
              <span className="text-cream">Research</span>
              <span className="text-clay">Mind</span>
            </p>
            <p className="text-[10px] text-cream/40 tracking-widest leading-tight uppercase">AI Workspace</p>
          </div>
        </Link>
        {/* Desktop collapse / Mobile close */}
        {showClose ? (
          <button onClick={onClose} className="text-cream/50 hover:text-cream p-1 rounded-lg hover:bg-cream/10 transition-colors">
            <X size={16} />
          </button>
        ) : (
          <button onClick={onToggle} title="Collapse sidebar" className="text-cream/40 hover:text-cream p-1 rounded-lg hover:bg-cream/10 transition-colors">
            <PanelLeftClose size={16} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 overflow-y-auto space-y-0.5">
        {(superAdmin ? NAV.filter((item) => 'adminOnly' in item && item.adminOnly) : NAV).map((item, i) => {
          if ('divider' in item) {
            return (
              <div key={i} className="pt-4 pb-1 px-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-cream/30">{item.label}</p>
              </div>
            );
          }

          // Admin link is only visible to super admins.
          if (item.adminOnly && !superAdmin) return null;

          const Icon = item.icon;
          const proLocked = item.proOnly && !pro;
          const active = isActive(item.href, item.exact);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all min-h-[40px] ${
                active ? 'bg-clay text-white shadow-sm' : 'text-cream/60 hover:text-cream hover:bg-cream/10'
              }`}
            >
              <Icon size={16} className="flex-shrink-0" />
              <span className="flex-1">{item.label}</span>
              {item.comingSoon ? (
                <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-cream/10 text-cream/50">
                  <Lock size={9} /> Soon
                </span>
              ) : proLocked ? (
                <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-clay/20 text-clay">
                  <Crown size={9} /> Pro
                </span>
              ) : active ? (
                <ChevronRight size={14} className="opacity-60" />
              ) : null}
            </Link>
          );
        })}
      </nav>

      {/* User — the name/plan block links to the profile page */}
      <div className="border-t border-cream/10 p-3 flex-shrink-0">
        <div className="flex items-center gap-1">
          <Link
            href="/dashboard/profile"
            title="View profile"
            className="flex items-center gap-3 px-2 py-2 flex-1 min-w-0 rounded-lg hover:bg-cream/10 transition-colors"
          >
            <div className="w-8 h-8 bg-clay rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold text-white">
              {getInitials(user?.name || 'U')}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-cream truncate">{user?.name}</p>
              <div className="flex items-center gap-1.5">
                <PlanBadge user={user} />
              </div>
            </div>
          </Link>
          <button onClick={logout} title="Sign out" className="p-1.5 text-cream/40 hover:text-cream rounded-lg hover:bg-cream/10 transition-colors flex-shrink-0">
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
