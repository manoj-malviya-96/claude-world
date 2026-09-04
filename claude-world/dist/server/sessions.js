import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
// Source of truth for what's running: the Claude Code CLI's own session
// registry. This only sees sessions on this machine (interactive + background) -
// cloud/remote-control sessions aren't exposed by any local API.
export async function listSessions() {
    let raw;
    try {
        ({ stdout: raw } = await execFileAsync('claude', ['agents', '--json', '--all'], {
            encoding: 'utf8',
            maxBuffer: 10 * 1024 * 1024,
        }));
    }
    catch (err) {
        throw new Error(`could not list Claude sessions (\`claude agents --json\` failed): ${err.message}`);
    }
    return JSON.parse(raw);
}
export function findSession(sessions, sessionId) {
    return sessions.find((s) => s.sessionId === sessionId);
}
