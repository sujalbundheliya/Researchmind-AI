'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Users } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import api from '@/lib/api';
import UpgradePrompt from '@/components/UpgradePrompt';

export default function JoinWorkspacePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [needsUpgrade, setNeedsUpgrade] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<{ email: string; role: string } | null>(null);

  useEffect(() => {
    getCurrentUser().then(u => {
      setLoggedIn(!!u);
    });

    // Decode JWT payload (no verification — just for display)
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      setInviteInfo({ email: payload.email, role: payload.role });
    } catch { /* ignore */ }
  }, [token]);

  const handleAccept = async () => {
    if (!loggedIn) {
      router.push(`/login?redirect=/join/${token}`);
      return;
    }
    setJoining(true);
    setError('');
    try {
      const res = await api.post<{ id: string }>('/workspaces/join', { token });
      router.push(`/workspaces/${res.data.id}`);
    } catch (err: unknown) {
      const resp = (err as { response?: { status?: number; data?: { code?: string; message?: string } } })?.response;
      // Shared workspaces are a Pro feature — an invited Free user gets a 403
      // UPGRADE_REQUIRED. Show the upgrade caution screen instead of a raw error.
      if (resp?.status === 403 && resp?.data?.code === 'UPGRADE_REQUIRED') {
        setNeedsUpgrade(true);
        setJoining(false);
        return;
      }
      setError(resp?.data?.message || 'Failed to join workspace');
      setJoining(false);
    }
  };

  if (needsUpgrade) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
        <div className="max-w-lg w-full">
          <UpgradePrompt
            icon={Users}
            requiredPlan="pro"
            title="Accepting this invite needs Pro"
            description={`Shared workspaces are a Pro feature. Upgrade your account to accept${
              inviteInfo?.role ? ` your ${inviteInfo.role}` : ' this'
            } invitation and start collaborating.`}
            bullets={[
              'Shared workspaces & real-time collaboration',
              'Unlimited uploads, extraction, reviews & drafts',
              'Zotero import',
            ]}
          />
          <p className="text-center text-xs text-subtle mt-1">
            Your invite stays valid — upgrade, then open this link again to join.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl border border-line p-8 max-w-md w-full shadow-sm text-center">
        <div className="text-4xl mb-4">🤝</div>
        <h1 className="text-xl font-bold text-ink mb-2">Workspace Invitation</h1>

        {inviteInfo ? (
          <p className="text-muted text-sm mb-6">
            You have been invited to join a workspace as{' '}
            <span className="font-semibold capitalize">{inviteInfo.role}</span>
            {inviteInfo.email && (
              <>
                {' '}(sent to <span className="font-semibold">{inviteInfo.email}</span>)
              </>
            )}
          </p>
        ) : (
          <p className="text-muted text-sm mb-6">
            You have been invited to join a shared research workspace.
          </p>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        {!loggedIn ? (
          <div>
            <p className="text-sm text-muted mb-4">You need to be logged in to accept this invitation.</p>
            <button
              onClick={() => router.push(`/login?redirect=/join/${token}`)}
              className="w-full py-2.5 bg-clay text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Sign In to Accept
            </button>
            <button
              onClick={() => router.push(`/register?redirect=/join/${token}`)}
              className="w-full mt-2 py-2.5 border border-clay text-clay rounded-lg text-sm font-medium hover:bg-blue-50"
            >
              Create Account
            </button>
          </div>
        ) : (
          <button
            onClick={handleAccept}
            disabled={joining}
            className="w-full py-2.5 bg-clay text-white rounded-lg text-sm font-medium hover:bg-clay-hover disabled:opacity-50"
          >
            {joining ? 'Joining…' : 'Accept Invitation'}
          </button>
        )}
      </div>
    </div>
  );
}
