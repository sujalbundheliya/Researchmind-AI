import AppShell from '@/components/AppShell';

// Workspace detail (/workspaces/[workspaceId]) renders inside the standard
// app shell (sidebar + topbar). The list lives at /dashboard/workspaces.
export default function WorkspacesLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
