import AppShell from '@/components/AppShell';

// The draft editor is a full-height workspace → full-bleed.
export default function DraftsLayout({ children }: { children: React.ReactNode }) {
  return <AppShell fullBleed>{children}</AppShell>;
}
