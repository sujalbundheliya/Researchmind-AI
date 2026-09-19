import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider, themeInitScript } from '@/lib/theme';
import { ConfirmProvider } from '@/lib/confirm';
import UpgradeToast from '@/components/UpgradeToast';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'ResearchMind AI',
    template: '%s — ResearchMind AI',
  },
  description: 'AI-powered research workspace for scholars. Upload papers, Q&A, systematic review, AI writing, and team collaboration.',
  icons: {
    icon: '/brand/favicon.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs before paint so the page never flashes the wrong theme */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${inter.className} bg-canvas text-ink`} suppressHydrationWarning>
        <ThemeProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
          <UpgradeToast />
        </ThemeProvider>
      </body>
    </html>
  );
}
