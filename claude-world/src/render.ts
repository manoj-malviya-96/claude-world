import type { AgentInfo, WorldState } from '../shared/types';
import { getPosition, setPosition } from './positions';
import { isDismissed } from './dismissed';

export type AgentClickHandler = (agent: AgentInfo) => void;

const DRAG_THRESHOLD = 5;
const TOKEN_SIZE = 84; // keep in sync with .agent width in style.css
const ISLAND_FIELD_WIDTH = 280;

function statusClass(agent: AgentInfo): string {
  if (agent.pendingQuestion) return 'status-waiting';
  return agent.status === 'busy' ? 'status-busy' : 'status-idle';
}

function escapeHtml(str: string): string {
  return str.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

function layoutPosition(index: number, fieldWidth: number): { x: number; y: number } {
  const cols = Math.max(1, Math.floor(fieldWidth / (TOKEN_SIZE + 12)));
  const col = index % cols;
  const row = Math.floor(index / cols);
  return { x: col * (TOKEN_SIZE + 12) + 8, y: row * (TOKEN_SIZE + 34) + 8 };
}

function makeAgentEl(agent: AgentInfo, index: number, onClick: AgentClickHandler): HTMLButtonElement {
  const el = document.createElement('button');
  el.className = 'agent';
  el.dataset.sessionId = agent.sessionId;
  el.type = 'button';
  el.style.width = `${TOKEN_SIZE}px`; // TOKEN_SIZE is the single source of truth for this - style.css has no width rule for .agent

  const pos = getPosition(agent.sessionId) ?? layoutPosition(index, ISLAND_FIELD_WIDTH);
  el.style.left = `${pos.x}px`;
  el.style.top = `${pos.y}px`;

  el.innerHTML = `
    <div class="avatar-wrap ${statusClass(agent)}">
      <div class="avatar" style="background:${agent.avatarColor}">${agent.avatarEmoji}</div>
      ${agent.pendingQuestion ? '<span class="bubble">?</span>' : ''}
    </div>
    <div class="agent-name" title="${escapeHtml(agent.displayName)}">${escapeHtml(agent.displayName)}</div>
    <div class="agent-archetype" title="${escapeHtml(agent.avatarName)}">${escapeHtml(agent.avatarName)}</div>
  `;

  let dragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let originX = pos.x;
  let originY = pos.y;

  el.addEventListener('pointerdown', (ev) => {
    dragging = true;
    moved = false;
    startX = ev.clientX;
    startY = ev.clientY;
    originX = parseFloat(el.style.left) || 0;
    originY = parseFloat(el.style.top) || 0;
    el.setPointerCapture(ev.pointerId);
    el.classList.add('dragging');
  });

  el.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) moved = true;
    if (!moved) return;

    const field = el.parentElement as HTMLElement;
    const maxX = Math.max(0, field.clientWidth - TOKEN_SIZE);
    const maxY = Math.max(0, field.clientHeight - TOKEN_SIZE);
    el.style.left = `${Math.min(Math.max(0, originX + dx), maxX)}px`;
    el.style.top = `${Math.min(Math.max(0, originY + dy), maxY)}px`;
  });

  const endDrag = (ev: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    el.classList.remove('dragging');
    if (moved) {
      setPosition(agent.sessionId, { x: parseFloat(el.style.left), y: parseFloat(el.style.top) });
      ev.preventDefault();
    } else {
      onClick(agent);
    }
  };

  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', () => {
    dragging = false;
    el.classList.remove('dragging');
  });

  return el;
}

function visibleAgents(agents: AgentInfo[]): AgentInfo[] {
  return agents.filter((a) => !(a.pid === null && isDismissed(a.sessionId)));
}

export function renderIslands(container: HTMLElement, state: WorldState, onClick: AgentClickHandler): void {
  container.innerHTML = '';

  for (const project of state.projects) {
    const agents = visibleAgents(project.agents);
    if (agents.length === 0) continue;

    const island = document.createElement('div');
    island.className = 'island';

    const nameEl = document.createElement('div');
    nameEl.className = 'island-name';
    nameEl.textContent = project.name;
    island.appendChild(nameEl);

    const field = document.createElement('div');
    field.className = 'agents-field';
    const cols = Math.max(1, Math.floor(ISLAND_FIELD_WIDTH / (TOKEN_SIZE + 12)));
    const rows = Math.ceil(agents.length / cols);
    field.style.height = `${rows * (TOKEN_SIZE + 34) + 16}px`;
    island.appendChild(field);

    agents.forEach((agent, i) => field.appendChild(makeAgentEl(agent, i, onClick)));
    container.appendChild(island);
  }
}

export function countAgents(state: WorldState): { total: number; waiting: number } {
  const agents = state.projects.flatMap((p) => visibleAgents(p.agents));
  return { total: agents.length, waiting: agents.filter((a) => a.pendingQuestion).length };
}
