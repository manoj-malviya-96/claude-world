import { execFileSync } from 'node:child_process';
import type { SessionKind } from '../shared/types.js';

export interface RawSession {
  pid?: number;
  id?: string;
  cwd: string;
  kind: SessionKind;
  startedAt: number;
  sessionId: string;
  name?: string;
  status?: string;
  state?: string;
}

// Source of truth for what's running: the Claude Code CLI's own session
// registry. This only sees sessions on this machine (interactive + background) -
// cloud/remote-control sessions aren't exposed by any local API.
export function listSessions(): RawSession[] {
  let raw: string;
  try {
    raw = execFileSync('claude', ['agents', '--json', '--all'], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (err) {
    throw new Error(`could not list Claude sessions (\`claude agents --json\` failed): ${(err as Error).message}`);
  }
  return JSON.parse(raw) as RawSession[];
}

export function findSession(sessions: RawSession[], sessionId: string): RawSession | undefined {
  return sessions.find((s) => s.sessionId === sessionId);
}
