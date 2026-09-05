// Finished agents (no live pid) can be dismissed from the map. This never
// touches the transcript on disk - it's purely a client-side hide, so nothing
// irreversible happens.
const KEY = 'agent-world:dismissed';

function load(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

const dismissed = load();

function persist(): void {
  localStorage.setItem(KEY, JSON.stringify([...dismissed]));
}

export function isDismissed(sessionId: string): boolean {
  return dismissed.has(sessionId);
}

export function dismiss(sessionId: string): void {
  dismissed.add(sessionId);
  persist();
}
