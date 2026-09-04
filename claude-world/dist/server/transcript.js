import { open } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
const ACTIVITY_TAIL_BYTES = 131072; // ~128KB is plenty for "what's it doing right now"
const CHAT_TAIL_BYTES = 524288; // ~512KB gives a reasonable chat scrollback
function projectDirFor(cwd) {
    const escaped = cwd.replace(/[/.]/g, '-');
    return path.join(homedir(), '.claude', 'projects', escaped);
}
function transcriptPath(cwd, sessionId) {
    return path.join(projectDirFor(cwd), `${sessionId}.jsonl`);
}
async function tailFile(filePath, maxBytes) {
    const handle = await open(filePath, 'r');
    try {
        const { size } = await handle.stat();
        const start = Math.max(0, size - maxBytes);
        const buf = Buffer.alloc(size - start);
        await handle.read(buf, 0, buf.length, start);
        return buf.toString('utf8');
    }
    finally {
        await handle.close();
    }
}
async function readLines(filePath, maxBytes) {
    let text;
    try {
        text = await tailFile(filePath, maxBytes);
    }
    catch {
        return [];
    }
    return text
        .split('\n')
        .slice(1) // drop a possibly-partial first line
        .filter(Boolean)
        .map((line) => {
        try {
            return JSON.parse(line);
        }
        catch {
            return null;
        }
    })
        .filter((e) => e !== null);
}
function truncate(text, max) {
    const trimmed = text.trim();
    return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}
function recordIfAskUserQuestion(tu, askQuestions) {
    if (tu.name !== 'AskUserQuestion')
        return;
    const questions = tu.input?.questions ?? [];
    if (!questions.length)
        return;
    askQuestions.set(tu.id, questions.map((q) => q.question).join(' / '));
}
function describeToolUse(block) {
    const input = block.input ?? {};
    switch (block.name) {
        case 'Bash':
            return `running: ${truncate(String(input.command ?? ''), 80)}`;
        case 'Read':
            return `reading ${truncate(String(input.file_path ?? ''), 80)}`;
        case 'Edit':
            return `editing ${truncate(String(input.file_path ?? ''), 80)}`;
        case 'Write':
            return `writing ${truncate(String(input.file_path ?? ''), 80)}`;
        case 'AskUserQuestion':
            return 'asking a question';
        case 'Agent':
            return `delegating: ${truncate(String(input.description ?? ''), 80)}`;
        default:
            return `using ${block.name}`;
    }
}
// Reads the tail of a session's own transcript to answer two things a live
// process list can't: what is it doing right now, and is it stuck waiting on
// an unanswered AskUserQuestion.
export async function readActivity(cwd, sessionId) {
    const entries = await readLines(transcriptPath(cwd, sessionId), ACTIVITY_TAIL_BYTES);
    const resolvedToolUseIds = new Set();
    const askQuestions = new Map();
    let lastActivity = null;
    let lastTimestamp = null;
    for (const entry of entries) {
        const content = entry.message?.content;
        if (!Array.isArray(content))
            continue;
        for (const block of content) {
            if (block.type === 'tool_result') {
                resolvedToolUseIds.add(block.tool_use_id);
            }
            else if (block.type === 'tool_use') {
                const tu = block;
                recordIfAskUserQuestion(tu, askQuestions);
                lastActivity = describeToolUse(tu);
                lastTimestamp = entry.timestamp ?? lastTimestamp;
            }
            else if (block.type === 'text' && block.text?.trim()) {
                lastActivity = truncate(block.text, 140);
                lastTimestamp = entry.timestamp ?? lastTimestamp;
            }
        }
    }
    let pendingQuestion = null;
    for (const [id, question] of askQuestions) {
        if (!resolvedToolUseIds.has(id))
            pendingQuestion = question;
    }
    return { lastActivity, lastTimestamp, pendingQuestion };
}
// A readable chat thread: real user/assistant text turns, with tool calls
// collapsed into short system lines. Tool results are omitted - they're
// usually too large and raw to read as "chat".
export async function readChatLog(cwd, sessionId, limit = 40) {
    const entries = await readLines(transcriptPath(cwd, sessionId), CHAT_TAIL_BYTES);
    const messages = [];
    for (const entry of entries) {
        const role = entry.message?.role;
        const content = entry.message?.content;
        if (!Array.isArray(content) || (role !== 'user' && role !== 'assistant'))
            continue;
        for (const block of content) {
            if (block.type === 'text' && block.text?.trim()) {
                messages.push({
                    role: role === 'user' ? 'user' : 'assistant',
                    text: block.text.trim(),
                    timestamp: entry.timestamp ?? null,
                });
            }
            else if (block.type === 'tool_use') {
                messages.push({
                    role: 'system',
                    text: describeToolUse(block),
                    timestamp: entry.timestamp ?? null,
                });
            }
        }
    }
    return messages.slice(-limit);
}
