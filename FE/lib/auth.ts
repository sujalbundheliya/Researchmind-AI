import api from './api';

export type Role = 'user' | 'admin' | 'super_admin';
export type PlanId = 'free' | 'individual' | 'pro';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  plan: PlanId;
  plan_status: string | null;
  plan_renews_at: string | null;
  lifetime_uploads: number;
  extractions_used: number;
  reviews_used: number;
  drafts_used: number;
  storage_used_bytes: number;
  storage_limit_bytes: number;
  // Profile fields
  avatar_url?: string | null;
  institution?: string | null;
  bio?: string | null;
  created_at?: string;
  updated_at?: string | null;
  // Sign-in method — only returned by /auth/me, so optional on the shapes
  // register/login return.
  has_password?: boolean;
  has_google?: boolean;
}

/** Activity totals from GET /auth/usage (profile Usage tab). */
export interface UsageStats {
  documents: number;
  documents_ready: number;
  documents_failed: number;
  reviews: number;
  extraction_tables: number;
  drafts: number;
  chat_sessions: number;
}

let _cache: User | null = null;
let _cacheTime = 0;
let _inflight: Promise<User | null> | null = null;
const CACHE_TTL_MS = 30_000; // 30 s — enough to cover concurrent page-load calls

export async function getCurrentUser(): Promise<User | null> {
  if (_cache && Date.now() - _cacheTime < CACHE_TTL_MS) return _cache;
  if (_inflight) return _inflight;

  _inflight = api
    .get<User>('/auth/me')
    .then((res) => {
      _cache = res.data;
      _cacheTime = Date.now();
      return res.data;
    })
    .catch(() => {
      _cache = null;
      return null;
    })
    .finally(() => {
      _inflight = null;
    });

  return _inflight;
}

export function invalidateUserCache(): void {
  _cache = null;
  _cacheTime = 0;
}

export async function logout(): Promise<void> {
  invalidateUserCache();
  try {
    await api.post('/auth/logout');
  } catch {
    // ignore — clear cookie regardless
  }
  window.location.href = '/login';
}
