'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import api from '@/lib/api';

interface InviteModalProps {
  workspaceId: string;
  onClose: () => void;
}

export default function InviteModal({ workspaceId, onClose }: InviteModalProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [inviteLink, setInviteLink] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [sentTo, setSentTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const handleInvite = async () => {
    if (!email.trim()) { setError('Email required'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await api.post<{ invite_link: string; token: string; email_sent: boolean }>(
        `/workspaces/${workspaceId}/invite`,
        { email: email.trim(), role }
      );
      const fullLink = `${window.location.origin}/join/${res.data.token}`;
      setInviteLink(fullLink);
      setEmailSent(Boolean(res.data.email_sent));
      setSentTo(email.trim());
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Failed to generate invite');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-2xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-line">
          <h3 className="text-base font-semibold text-ink">Invite Collaborator</h3>
          <button onClick={onClose} className="text-subtle hover:text-ink text-2xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          {!inviteLink ? (
            <>
              <div>
                <label className="text-sm font-medium text-ink mb-1 block">Email Address</label>
                <input
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  type="email"
                  className="w-full bg-canvas border border-line rounded-lg px-3 py-2 text-sm text-ink placeholder:text-subtle focus:outline-none focus:border-clay focus:ring-2 focus:ring-clay/20 transition-colors"
                  placeholder="colleague@university.edu"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-ink mb-1 block">Role</label>
                <div className="relative">
                  <select
                    value={role}
                    onChange={e => setRole(e.target.value as 'editor' | 'viewer')}
                    className="w-full appearance-none bg-canvas border border-line rounded-lg pl-3 pr-9 py-2 text-sm text-ink focus:outline-none focus:border-clay focus:ring-2 focus:ring-clay/20 transition-colors cursor-pointer"
                  >
                    <option value="editor">Editor — can upload + chat</option>
                    <option value="viewer">Viewer — chat only</option>
                  </select>
                  <ChevronDown
                    size={16}
                    className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-subtle"
                  />
                </div>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                onClick={handleInvite}
                disabled={loading}
                className="w-full py-2.5 bg-clay text-white rounded-lg text-sm font-medium hover:bg-clay-hover disabled:opacity-50 transition-colors"
              >
                {loading ? 'Generating…' : 'Generate Invite Link'}
              </button>
            </>
          ) : (
            <div>
              {emailSent ? (
                <div className="flex items-start gap-2 bg-success/10 border border-success/30 rounded-lg p-3 mb-3">
                  <span className="text-success text-lg leading-none">✓</span>
                  <p className="text-sm text-ink">
                    Invite emailed to <strong className="break-all">{sentTo}</strong>. You can also share
                    the link below. It expires in 7 days and can only be used once.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted mb-3">
                  Share this link with your collaborator. It expires in 7 days and can only be used once.
                </p>
              )}
              <div className="bg-canvas border border-line rounded-lg p-3 mb-3">
                <p className="text-xs text-muted break-all font-mono">{inviteLink}</p>
              </div>
              <button
                onClick={handleCopy}
                className="w-full py-2.5 bg-clay text-white rounded-lg text-sm font-medium hover:bg-clay-hover"
              >
                {copied ? 'Copied ✓' : 'Copy Invite Link'}
              </button>
              <p className="text-xs text-subtle mt-3">
                Note: shared workspaces are a Pro feature, so your collaborator needs a Pro plan to
                accept — they&apos;ll be prompted to upgrade when they open the link.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
