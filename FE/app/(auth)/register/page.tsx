'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import api from '@/lib/api';
import { LogoIcon } from '@/components/Logo';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      await api.post('/auth/register', { name, email, password });
      router.push('/dashboard');
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'w-full px-3.5 py-2.5 border border-line rounded-xl text-sm focus:outline-none focus:ring-2 focus:border-transparent transition-shadow focus:ring-clay';

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-espresso via-clay-hover to-clay">
      <Link href="/" className="absolute top-5 left-5 inline-flex items-center gap-1.5 text-sm font-medium text-cream/70 hover:text-cream transition-colors">
        <ArrowLeft size={15} /> Back to home
      </Link>
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8 flex flex-col items-center gap-3">
          <div className="p-3 rounded-2xl shadow-lg bg-cream/10 backdrop-blur-sm">
            <LogoIcon size={48} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight font-serif text-cream">
              Research<span className="text-clay-soft">Mind</span>
            </h1>
            <p className="text-xs tracking-[0.2em] mt-0.5 uppercase text-cream/55">
              AI · Research Workspace
            </p>
          </div>
        </div>

        <div className="bg-surface rounded-2xl shadow-2xl shadow-black/30 p-8">
          <h2 className="text-xl font-semibold mb-6 text-ink">Create your account</h2>

          {error && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl">
              <span className="text-red-600 text-sm">{error}</span>
            </div>
          )}

          {/* Google OAuth */}
          <a
            href={`${process.env.NEXT_PUBLIC_API_URL}/auth/google`}
            className="flex items-center justify-center gap-3 w-full py-2.5 border border-line rounded-xl text-sm font-medium text-ink hover:bg-surface2 active:scale-[0.98] transition-all mb-5"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
              <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </a>

          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-line" />
            <span className="text-xs text-subtle font-medium">or</span>
            <div className="flex-1 h-px bg-line" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Full Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} required
                className={inputCls} placeholder="Dr. Jane Smith" />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">Email address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                className={inputCls} placeholder="you@university.edu" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8}
                  className={inputCls} placeholder="Min 8 chars" />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">Confirm</label>
                <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required
                  className={inputCls} placeholder="Repeat" />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-clay hover:bg-clay-hover text-white rounded-xl font-semibold text-sm active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-sm mt-2"
            >
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-sm text-muted mt-6">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-clay hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
