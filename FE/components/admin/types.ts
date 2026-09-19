/** Shared shapes for the admin console tabs (mirrors BE/src/controllers/admin.controller.js). */

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  plan: string;
  plan_status: string | null;
  lifetime_uploads: number;
  extractions_used: number;
  reviews_used: number;
  drafts_used: number;
  storage_used_bytes: number;
  storage_limit_bytes: number;
  created_at: string;
}

export interface AdminStats {
  totalUsers: number;
  totalDocuments: number;
  byPlan: { free: number; individual: number; pro: number };
  byRole: Record<string, number>;
  mrr: number;
  documents: {
    total: number;
    ready: number;
    processing: number;
    failed: number;
    fromUrl: number;
    totalBytes: number;
  };
  signups: { last_7d: number; last_30d: number };
  content: { reviews: number; extraction_tables: number; drafts: number; chat_sessions: number };
  messages: { unread: number; total: number };
}

export type MessageStatus = 'new' | 'read' | 'replied' | 'archived';

export interface ContactMessage {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: MessageStatus;
  email_sent: boolean;
  created_at: string;
  handled_at: string | null;
  handled_by_name: string | null;
}

export interface AdminDocument {
  id: string;
  original_name: string;
  file_size_bytes: number;
  status: 'ready' | 'processing' | 'failed';
  page_count: number | null;
  created_at: string;
  source_url: string | null;
  workspace_id: string | null;
  owner_email: string | null;
  owner_name: string | null;
}

export interface SystemHealth {
  database: { ok: boolean; latencyMs: number };
  aiService: { ok: boolean; latencyMs: number; url: string | null; error: string | null };
  config: {
    stripeSecretKey: boolean;
    stripePriceIndividual: boolean;
    stripePricePro: boolean;
    stripeWebhookSecret: boolean;
    googleOauth: boolean;
    smtp: boolean;
    contactEmail: string;
    maxFileSizeMb: number;
    nodeEnv: string;
  };
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' });
}
