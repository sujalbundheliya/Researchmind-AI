'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Chat history now lives in the chat workspace (GPT/Claude-style panel).
// Keep this route working by redirecting any old links/bookmarks.
export default function SessionsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/workspace/chat'); }, [router]);
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
