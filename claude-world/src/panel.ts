import type { AgentInfo, ChatMessage } from '../shared/types';
import { fetchChat, sendReply, stopAgent } from './api';
import { dismiss } from './dismissed';

const CHAT_POLL_MS = 2000;

const panelEl = document.getElementById('panel') as HTMLElement;
const bodyEl = document.getElementById('panel-body') as HTMLElement;

let currentSessionId: string | null = null;
let chatTimer: number | undefined;

document.getElementById('panel-close')!.addEventListener('click', closePanel);

export function closePanel(): void {
  currentSessionId = null;
  panelEl.hidden = true;
  if (chatTimer) window.clearInterval(chatTimer);
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'a while ago';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function escapeHtml(str: string): string {
  return str.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

function bubbleClass(role: ChatMessage['role']): string {
  if (role === 'user') return 'bubble-user';
  if (role === 'assistant') return 'bubble-assistant';
  return 'bubble-system';
}

async function refreshChat(): Promise<void> {
  if (!currentSessionId) return;
  const threadEl = document.getElementById('chat-thread');
  if (!threadEl) return;
  try {
    const log = await fetchChat(currentSessionId);
    const atBottom = threadEl.scrollTop + threadEl.clientHeight >= threadEl.scrollHeight - 20;
    threadEl.innerHTML = log.messages
      .map((m) => `<div class="bubble ${bubbleClass(m.role)}">${escapeHtml(m.text)}</div>`)
      .join('');
    if (atBottom) threadEl.scrollTop = threadEl.scrollHeight;
  } catch {
    // transient - the next poll will retry
  }
}

export function openPanel(agent: AgentInfo, onChanged: () => void): void {
  currentSessionId = agent.sessionId;
  panelEl.hidden = false;

  const questionHtml = agent.pendingQuestion
    ? `<div class="panel-section"><h3>Waiting on you</h3><div class="pending-question">${escapeHtml(agent.pendingQuestion)}</div></div>`
    : '';

  const inputHtml = agent.canReply
    ? `<textarea id="chat-input" placeholder="Message this idle background agent…"></textarea>
       <button id="chat-send">Send</button>`
    : `<p class="reply-hint">${
        agent.kind === 'interactive'
          ? "This is a live interactive session — there's no way to inject a reply into its terminal from here. Answer it in the terminal."
          : 'This background agent is busy. It can only take a follow-up once idle.'
      }</p>`;

  const stopHtml = agent.canStop
    ? '<button id="agent-stop" class="danger">Stop this agent</button>'
    : agent.pid === null
      ? '<button id="agent-dismiss" class="ghost">Dismiss from map</button>'
      : '';

  bodyEl.innerHTML = `
    <div class="panel-avatar">${agent.avatarEmoji}</div>
    <h2 class="panel-title">${escapeHtml(agent.displayName)}</h2>
    <div class="panel-sub">${escapeHtml(agent.avatarName)} · ${agent.kind} · ${escapeHtml(agent.status)}</div>
    <div class="panel-section">
      <h3>Doing right now</h3>
      <div>${escapeHtml(agent.lastActivity ?? 'no recent activity')}</div>
      <div class="reply-hint">${timeAgo(agent.lastTimestamp)}</div>
    </div>
    ${questionHtml}
    <div class="panel-section">
      <h3>Chat</h3>
      <div id="chat-thread" class="chat-thread"></div>
      <div class="chat-input-row">${inputHtml}</div>
      <div class="reply-status" id="reply-status"></div>
    </div>
    <div class="panel-section">
      <h3>Details</h3>
      <div class="reply-hint">pid ${agent.pid ?? 'n/a'} · session ${agent.sessionId.slice(0, 8)}…</div>
      ${stopHtml}
    </div>
  `;

  void refreshChat();
  if (chatTimer) window.clearInterval(chatTimer);
  chatTimer = window.setInterval(refreshChat, CHAT_POLL_MS);

  document.getElementById('chat-send')?.addEventListener('click', () => void handleSend(agent.sessionId));
  document.getElementById('agent-stop')?.addEventListener('click', () => void handleStop(agent, onChanged));
  document.getElementById('agent-dismiss')?.addEventListener('click', () => {
    dismiss(agent.sessionId);
    closePanel();
    onChanged();
  });
}

async function handleSend(sessionId: string): Promise<void> {
  const textarea = document.getElementById('chat-input') as HTMLTextAreaElement | null;
  const status = document.getElementById('reply-status');
  const button = document.getElementById('chat-send') as HTMLButtonElement | null;
  if (!textarea || !button) return;
  const message = textarea.value.trim();
  if (!message) return;

  button.disabled = true;
  if (status) status.textContent = 'Sending…';
  try {
    await sendReply(sessionId, message);
    textarea.value = '';
    if (status) status.textContent = 'Sent — reply will appear in the chat shortly.';
    setTimeout(refreshChat, 1500);
  } catch (err) {
    if (status) status.textContent = `Error: ${(err as Error).message}`;
  } finally {
    button.disabled = false;
  }
}

async function handleStop(agent: AgentInfo, onChanged: () => void): Promise<void> {
  if (!window.confirm(`Stop "${agent.displayName}" (pid ${agent.pid})? This sends SIGTERM to the running process.`)) {
    return;
  }
  const status = document.getElementById('reply-status');
  try {
    await stopAgent(agent.sessionId);
    if (status) status.textContent = 'Stopped.';
    onChanged();
  } catch (err) {
    if (status) status.textContent = `Error: ${(err as Error).message}`;
  }
}
