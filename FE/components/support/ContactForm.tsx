'use client';

import { useEffect, useState } from 'react';
import { Send, Loader2, CheckCircle2 } from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import api from '@/lib/api';
import { SUBJECT_OPTIONS } from '@/lib/support';

const LIMITS = { name: 100, email: 254, subject: 200, message: 5000 };

interface ContactFormProps {
  /** Preselected "What's this about?" value — e.g. 'Technical support' in-app. */
  defaultSubject?: string;
  /** Signed-in users already told us who they are; hide the name/email inputs. */
  hideIdentityFields?: boolean;
}

/**
 * The contact/support form. Shared by the public /contact page and the in-app
 * /dashboard/support page so both post to the same endpoint with the same
 * validation — only the surrounding chrome differs.
 */
export default function ContactForm({ defaultSubject, hideIdentityFields = false }: ContactFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState(defaultSubject ?? SUBJECT_OPTIONS[0]);
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // honeypot — real users never fill this

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  // Prefill for signed-in visitors. getCurrentUser tolerates a 401 here, so
  // this is a no-op for logged-out traffic rather than an error.
  useEffect(() => {
    getCurrentUser().then((u) => {
      if (!u) return;
      setName((prev) => prev || u.name || '');
      setEmail((prev) => prev || u.email || '');
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim() || !email.trim() || !message.trim()) {
      setError('Please fill in your name, email and message.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Please enter a valid email address.');
      return;
    }

    setSending(true);
    try {
      await api.post('/contact', {
        name: name.trim(),
        email: email.trim(),
        subject: subject.trim(),
        message: message.trim(),
        website,
      });
      setSent(true);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message ?? 'Could not send your message. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const inputClass =
    'w-full px-3.5 py-2.5 rounded-lg bg-canvas border border-line text-sm text-ink placeholder:text-subtle focus:outline-none focus:border-clay focus:ring-2 focus:ring-clay/20 transition-colors';

  if (sent) {
    return (
      <div className="text-center py-12">
        <div className="w-14 h-14 rounded-full bg-success/15 flex items-center justify-center mx-auto mb-5">
          <CheckCircle2 size={28} className="text-success" />
        </div>
        <h2 className="text-xl font-bold text-ink mb-2">Message sent</h2>
        <p className="text-muted text-sm leading-relaxed max-w-sm mx-auto mb-6">
          Thanks for reaching out. We usually reply within 1–2 business days at{' '}
          <span className="text-ink font-medium">{email}</span>.
        </p>
        <button
          onClick={() => { setSent(false); setMessage(''); setSubject(defaultSubject ?? SUBJECT_OPTIONS[0]); }}
          className="text-sm font-medium text-clay hover:underline"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {hideIdentityFields ? (
        // Signed in: we know the name/email, so just say where the reply goes.
        <p className="text-xs text-muted bg-canvas border border-line rounded-lg px-3.5 py-2.5">
          We&apos;ll reply to <span className="text-ink font-medium">{email || 'your account email'}</span>.
        </p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-5">
          <div>
            <label htmlFor="name" className="block text-xs font-semibold text-ink mb-1.5">
              Your name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={LIMITS.name}
              required
              placeholder="Ada Lovelace"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="email" className="block text-xs font-semibold text-ink mb-1.5">
              Email address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={LIMITS.email}
              required
              placeholder="you@university.edu"
              className={inputClass}
            />
          </div>
        </div>
      )}

      <div>
        <label htmlFor="subject" className="block text-xs font-semibold text-ink mb-1.5">
          What&apos;s this about?
        </label>
        <select
          id="subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className={inputClass}
        >
          {SUBJECT_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="message" className="block text-xs font-semibold text-ink mb-1.5">
          Message
        </label>
        <textarea
          id="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={LIMITS.message}
          required
          rows={7}
          placeholder="Tell us what's on your mind…"
          className={`${inputClass} resize-y`}
        />
        <p className="text-[11px] text-subtle mt-1.5 text-right">
          {message.length} / {LIMITS.message}
        </p>
      </div>

      {/* Honeypot: hidden from people, irresistible to bots. */}
      <input
        type="text"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute opacity-0 pointer-events-none h-0 w-0"
      />

      {error && (
        <p className="text-sm text-danger bg-danger/10 border border-danger/20 rounded-lg px-3.5 py-2.5">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={sending}
        className="w-full flex items-center justify-center gap-2 bg-clay text-white font-semibold text-sm px-5 py-3 rounded-lg hover:bg-clay-hover transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-clay/20"
      >
        {sending ? (
          <><Loader2 size={16} className="animate-spin" /> Sending…</>
        ) : (
          <><Send size={15} /> Send message</>
        )}
      </button>
    </form>
  );
}
