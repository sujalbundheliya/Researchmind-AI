import { useState, useCallback } from 'react';
import api from '@/lib/api';

export interface Source {
  doc_name: string;
  page_number?: number;
}

export interface Message {
  id: string;
  session_id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  created_at: string;
}

export interface Session {
  id: string;
  title: string;
  mode: string;
  document_ids: string[];
  workspace_id: string | null;
}

export function useChat() {
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const createSession = useCallback(async (
    mode: string,
    docIds: string[],
    title?: string,
    workspaceId?: string | null,
  ): Promise<Session> => {
    const res = await api.post<Session>('/chat/sessions', {
      title: title || 'New Chat',
      mode,
      document_ids: docIds,
      workspace_id: workspaceId || null,
    });
    setSession(res.data);
    setMessages([]);
    return res.data;
  }, []);

  const loadSession = useCallback(async (sessionId: string) => {
    const res = await api.get<Session & { messages: Message[] }>(`/chat/sessions/${sessionId}`);
    const { messages: msgs, ...sess } = res.data;
    setSession(sess as Session);
    setMessages(msgs.map((m) => ({ ...m, sources: m.sources ?? [] })));
    return res.data;
  }, []);

  const sendMessage = useCallback(async (question: string, docIds?: string[]) => {
    if (!session) return;
    setError('');
    setIsLoading(true);

    const optimistic: Message = {
      id: `temp-${Date.now()}`,
      session_id: session.id,
      role: 'user',
      content: question,
      sources: [],
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const res = await api.post<{
        user_message: Message;
        assistant_message: Message;
      }>(`/chat/sessions/${session.id}/message`, {
        question,
        document_ids: docIds ?? [],
      });

      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimistic.id),
        res.data.user_message,
        { ...res.data.assistant_message, sources: res.data.assistant_message.sources ?? [] },
      ]);
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setError('Failed to send message. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  return { session, messages, isLoading, error, createSession, loadSession, sendMessage };
}
