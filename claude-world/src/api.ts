import type { WorldState, ChatLog } from '../shared/types';

async function json<T>(res: Response): Promise<T> {
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `request failed (${res.status})`);
  return data as T;
}

export function fetchState(): Promise<WorldState> {
  return fetch('/api/state').then((r) => json<WorldState>(r));
}

export function fetchChat(sessionId: string): Promise<ChatLog> {
  return fetch(`/api/agents/${encodeURIComponent(sessionId)}/chat`).then((r) => json<ChatLog>(r));
}

export function sendReply(sessionId: string, message: string): Promise<{ queued: boolean }> {
  return fetch(`/api/agents/${encodeURIComponent(sessionId)}/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  }).then((r) => json<{ queued: boolean }>(r));
}

export function stopAgent(sessionId: string): Promise<{ stopped: boolean }> {
  return fetch(`/api/agents/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }).then((r) =>
    json<{ stopped: boolean }>(r),
  );
}
