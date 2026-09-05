import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listSessions, findSession } from './sessions.js';
import { readActivity, readChatLog } from './transcript.js';
import { avatarFor, nameFor, islandNameFor } from './avatars.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIR = path.join(__dirname, '../client'); // only present after `vite build`
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
function projectNameFromCwd(cwd) {
    return cwd.split('/').filter(Boolean).pop() ?? cwd;
}
async function buildState() {
    const sessions = await listSessions();
    // Each session's transcript lives in its own file, so tailing them is
    // independent I/O - run them concurrently instead of one at a time.
    const agents = await Promise.all(sessions.map(async (session) => {
        const activity = await readActivity(session.cwd, session.sessionId);
        const avatar = avatarFor(session.sessionId);
        const pid = session.pid ?? null;
        return {
            cwd: session.cwd,
            agent: {
                sessionId: session.sessionId,
                pid,
                kind: session.kind,
                status: session.status ?? session.state ?? 'unknown',
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
            },
        };
    }));
    const byProject = new Map();
    for (const { cwd, agent } of agents) {
        if (!byProject.has(cwd)) {
            byProject.set(cwd, { path: cwd, name: projectNameFromCwd(cwd), islandName: islandNameFor(cwd), agents: [] });
        }
        byProject.get(cwd).agents.push(agent);
    }
    return { projects: Array.from(byProject.values()), updatedAt: new Date().toISOString() };
}
function sendJson(res, status, data) {
    const body = JSON.stringify(data);
    res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
}
async function readBody(req) {
    let body = '';
    for await (const chunk of req)
        body += chunk;
    return body;
}
function sessionIdFromAgentsPath(url, suffix) {
    const match = url.match(new RegExp(`^/api/agents/([^/]+)${suffix}$`));
    return match ? decodeURIComponent(match[1]) : null;
}
async function handleChat(res, sessionId) {
    const sessions = await listSessions();
    const session = findSession(sessions, sessionId);
    if (!session)
        return sendJson(res, 404, { error: 'unknown session' });
    const messages = await readChatLog(session.cwd, sessionId);
    const payload = { sessionId, messages };
    sendJson(res, 200, payload);
}
// Only idle background sessions can be sent a follow-up. A live interactive
// terminal session has no stdin we can reach from here, so it stays read-only.
async function handleReply(req, res, sessionId) {
    const body = await readBody(req);
    let payload;
    try {
        payload = JSON.parse(body);
    }
    catch {
        return sendJson(res, 400, { error: 'invalid JSON body' });
    }
    const message = payload.message;
    if (typeof message !== 'string' || !message.trim()) {
        return sendJson(res, 400, { error: 'message is required' });
    }
    const sessions = await listSessions();
    const session = findSession(sessions, sessionId);
    if (!session || session.kind !== 'background' || session.status !== 'idle') {
        return sendJson(res, 409, { error: 'that agent is not an idle background session, so it cannot be reached from here' });
    }
    const child = execFile('claude', ['-p', '--resume', sessionId, message], { maxBuffer: 10 * 1024 * 1024 }, (err, _stdout, stderr) => {
        if (err)
            console.error(`[csworld] reply to ${sessionId} failed:`, stderr || err.message);
    });
    child.unref();
    sendJson(res, 202, { queued: true });
}
// Stopping is a real, irreversible action against a real process, so it's
// scoped tight: only background agents (never a live interactive terminal
// someone is actively typing in) and only when we have a pid to signal.
async function handleStop(res, sessionId) {
    const sessions = await listSessions();
    const session = findSession(sessions, sessionId);
    if (!session)
        return sendJson(res, 404, { error: 'unknown session' });
    if (session.kind !== 'background') {
        return sendJson(res, 409, { error: 'interactive terminal sessions can only be closed from their own terminal' });
    }
    if (!session.pid) {
        return sendJson(res, 409, { error: 'this agent has already finished; there is no process to stop' });
    }
    try {
        process.kill(session.pid, 'SIGTERM');
    }
    catch (err) {
        return sendJson(res, 500, { error: `failed to stop pid ${session.pid}: ${err.message}` });
    }
    sendJson(res, 200, { stopped: true });
}
async function serveStatic(req, res) {
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
    }
    catch {
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
                return sendJson(res, 200, await buildState());
            }
            const chatId = req.method === 'GET' ? sessionIdFromAgentsPath(url, '/chat') : null;
            if (chatId)
                return await handleChat(res, chatId);
            const replyId = req.method === 'POST' ? sessionIdFromAgentsPath(url, '/reply') : null;
            if (replyId)
                return await handleReply(req, res, replyId);
            const stopId = req.method === 'DELETE' ? sessionIdFromAgentsPath(url, '') : null;
            if (stopId)
                return await handleStop(res, stopId);
            if (req.method === 'GET')
                return await serveStatic(req, res);
            res.writeHead(405);
            res.end();
        }
        catch (err) {
            console.error('[csworld] request failed:', err);
            sendJson(res, 500, { error: err.message });
        }
    });
}
