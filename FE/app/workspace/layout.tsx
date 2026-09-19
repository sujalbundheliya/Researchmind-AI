import AppShell from '@/components/AppShell';

// Workspace routes (chat, single-doc viewer) manage their own scroll → full-bleed.
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <AppShell fullBleed>{children}</AppShell>;
}
