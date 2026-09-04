import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { listSessions, findSession } from './sessions.js';
import { readActivity, readChatLog } from './transcript.js';
import { avatarFor, nameFor } from './avatars.js';
import type { WorldState, ProjectInfo, ChatLog } from '../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.join(__dirname, '../client'); // only present after `vite build`

const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

function projectNameFromCwd(cwd: string): string {
  return cwd.split('/').filter(Boolean).pop() ?? cwd;
}

function buildState(): WorldState {
  const sessions = listSessions();
  const byProject = new Map<string, ProjectInfo>();

  for (const session of sessions) {
    const activity = readActivity(session.cwd, session.sessionId);
    const avatar = avatarFor(session.sessionId);
    const pid = session.pid ?? null;
    const status = session.status ?? session.state ?? 'unknown';

    if (!byProject.has(session.cwd)) {
      byProject.set(session.cwd, { path: session.cwd, name: projectNameFromCwd(session.cwd), agents: [] });
    }
    byProject.get(session.cwd)!.agents.push({
      sessionId: session.sessionId,
      pid,
      kind: session.kind,
      status,
      startedAt: session.startedAt,
      displayName: nameFor(session.sessionId, session.name),
      avatarName: avatar.name,
      avatarEmoji: avatar.emoji,
      avatarColor: avatar.color,
      lastActivity: activity.lastActivity,
      lastTimestamp: activity.lastTimestamp,
      pendingQuestion: activity.pendingQuestion,
      canReply: session.kind === 'background' && session.status === 'idle',
      canStop: session.kind === 'background' && pid !== null,
    });
  }

  return { projects: Array.from(byProject.values()), updatedAt: new Date().toISOString() };
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

async function readBody(req: IncomingMessage): Promise<string> {
  let body = '';
  for await (const chunk of req) body += chunk;
  return body;
}

function sessionIdFromAgentsPath(url: string, suffix: string): string | null {
  const match = url.match(new RegExp(`^/api/agents/([^/]+)${suffix}$`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function handleChat(res: ServerResponse, sessionId: string): Promise<void> {
  const sessions = listSessions();
  const session = findSession(sessions, sessionId);
  if (!session) return sendJson(res, 404, { error: 'unknown session' });
  const messages = readChatLog(session.cwd, sessionId);
  const payload: ChatLog = { sessionId, messages };
  sendJson(res, 200, payload);
}

// Only idle background sessions can be sent a follow-up. A live interactive
// terminal session has no stdin we can reach from here, so it stays read-only.
async function handleReply(req: IncomingMessage, res: ServerResponse, sessionId: string): Promise<void> {
  const body = await readBody(req);
  let payload: { message?: string };
  try {
    payload = JSON.parse(body);
  } catch {
    return sendJson(res, 400, { error: 'invalid JSON body' });
  }

  const message = payload.message;
  if (typeof message !== 'string' || !message.trim()) {
    return sendJson(res, 400, { error: 'message is required' });
  }

  const sessions = listSessions();
  const session = findSession(sessions, sessionId);
  if (!session || session.kind !== 'background' || session.status !== 'idle') {
    return sendJson(res, 409, { error: 'that agent is not an idle background session, so it cannot be reached from here' });
  }

  const child = execFile(
    'claude',
    ['-p', '--resume', sessionId, message],
    { maxBuffer: 10 * 1024 * 1024 },
    (err, _stdout, stderr) => {
      if (err) console.error(`[csworld] reply to ${sessionId} failed:`, stderr || err.message);
    },
  );
  child.unref();

  sendJson(res, 202, { queued: true });
}

// Stopping is a real, irreversible action against a real process, so it's
// scoped tight: only background agents (never a live interactive terminal
// someone is actively typing in) and only when we have a pid to signal.
async function handleStop(res: ServerResponse, sessionId: string): Promise<void> {
  const sessions = listSessions();
  const session = findSession(sessions, sessionId);
  if (!session) return sendJson(res, 404, { error: 'unknown session' });
  if (session.kind !== 'background') {
    return sendJson(res, 409, { error: 'interactive terminal sessions can only be closed from their own terminal' });
  }
  if (!session.pid) {
    return sendJson(res, 409, { error: 'this agent has already finished; there is no process to stop' });
  }
  try {
    process.kill(session.pid, 'SIGTERM');
  } catch (err) {
    return sendJson(res, 500, { error: `failed to stop pid ${session.pid}: ${(err as Error).message}` });
  }
  sendJson(res, 200, { stopped: true });
}

async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const urlPath = req.url === '/' ? '/index.html' : (req.url ?? '/index.html');
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(CLIENT_DIR, safePath);
  if (!filePath.startsWith(CLIENT_DIR)) {
    res.writeHead(403);
    res.end();
    return;
  }
  try {
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found. Run `pnpm build` first, or use `pnpm dev` for the Vite dev server.');
  }
}

// The whole app: session polling, chat, reply, stop, and (once built) the
// static client. Not listening yet - the CLI entrypoint owns the port/host
// and what happens once it's up.
export function createApp() {
  return createServer(async (req, res) => {
    const url = req.url ?? '/';
    try {
      if (req.method === 'GET' && url === '/api/state') {
        return sendJson(res, 200, buildState());
      }

      const chatId = req.method === 'GET' ? sessionIdFromAgentsPath(url, '/chat') : null;
      if (chatId) return await handleChat(res, chatId);

      const replyId = req.method === 'POST' ? sessionIdFromAgentsPath(url, '/reply') : null;
      if (replyId) return await handleReply(req, res, replyId);

      const stopId = req.method === 'DELETE' ? sessionIdFromAgentsPath(url, '') : null;
      if (stopId) return await handleStop(res, stopId);

      if (req.method === 'GET') return await serveStatic(req, res);

      res.writeHead(405);
      res.end();
    } catch (err) {
      console.error('[csworld] request failed:', err);
      sendJson(res, 500, { error: (err as Error).message });
    }
  });
}
