import type { AgentInfo, WorldState } from '../shared/types';
import { getPosition, setPosition } from './positions';
import { isDismissed } from './dismissed';

export type AgentClickHandler = (agent: AgentInfo) => void;

const DRAG_THRESHOLD = 5;
const TOKEN_SIZE = 84; // keep in sync with .agent width in style.css
const ISLAND_FIELD_WIDTH = 280;
const ISLAND_WIDTH = 320; // keep in sync with .island width in style.css
const ISLAND_CHROME_HEIGHT = 68; // .island's own top+bottom padding, outside the agents-field
const CELL_GAP = 56;
const JITTER = 20; // max px an island can drift off its grid cell, must stay under (CELL_GAP - JITTER) to avoid overlap

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

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

function islandFieldHeight(agentCount: number): number {
  const cols = Math.max(1, Math.floor(ISLAND_FIELD_WIDTH / (TOKEN_SIZE + 12)));
  const rows = Math.ceil(agentCount / cols);
  return rows * (TOKEN_SIZE + 34) + 16;
}

// Scatters islands across the field instead of stacking them down the left
// edge: shuffle order by a path hash (so the same set of projects doesn't
// always land in the same reading order), then pack them into a loose grid
// row by row - each row's height is its tallest island, so variable agent
// counts never overlap - and jitter each island's position within its cell
// so the grid isn't visually rigid. Deterministic per project path, so a
// reload doesn't reshuffle islands the user has already found.
function scatterPositions(
  projects: WorldState['projects'],
  fieldWidth: number,
): { positions: Map<string, { x: number; y: number }>; totalHeight: number } {
  const cellWidth = ISLAND_WIDTH + CELL_GAP;
  const cols = Math.max(1, Math.floor(fieldWidth / cellWidth));

  const ordered = [...projects].sort((a, b) => hashString(a.path) - hashString(b.path));
  const positions = new Map<string, { x: number; y: number }>();

  let y = 0;
  for (let i = 0; i < ordered.length; i += cols) {
    const rowProjects = ordered.slice(i, i + cols);
    const rowHeight = Math.max(
      ...rowProjects.map((p) => ISLAND_CHROME_HEIGHT + islandFieldHeight(visibleAgents(p.agents).length)),
    );

    rowProjects.forEach((project, col) => {
      const h = hashString(project.path);
      const jitterX = (h % (2 * JITTER + 1)) - JITTER;
      const jitterY = (Math.floor(h / (2 * JITTER + 1)) % (2 * JITTER + 1)) - JITTER;
      positions.set(project.path, {
        x: col * cellWidth + CELL_GAP / 2 + jitterX,
        y: y + CELL_GAP / 2 + jitterY,
      });
    });

    y += rowHeight + CELL_GAP;
  }

  return { positions, totalHeight: y };
}

export function renderIslands(container: HTMLElement, state: WorldState, onClick: AgentClickHandler): void {
  container.innerHTML = '';

  const projects = state.projects.filter((p) => visibleAgents(p.agents).length > 0);
  const fieldWidth = container.clientWidth || window.innerWidth;
  const { positions, totalHeight } = scatterPositions(projects, fieldWidth);
  container.style.minHeight = `${totalHeight}px`;

  for (const project of projects) {
    const agents = visibleAgents(project.agents);

    const island = document.createElement('div');
    island.className = 'island';
    const pos = positions.get(project.path) ?? { x: 0, y: 0 };
    island.style.left = `${pos.x}px`;
    island.style.top = `${pos.y}px`;

    const nameEl = document.createElement('div');
    nameEl.className = 'island-name';
    nameEl.title = project.name;
    nameEl.textContent = project.islandName;
    island.appendChild(nameEl);

    const field = document.createElement('div');
    field.className = 'agents-field';
    field.style.height = `${islandFieldHeight(agents.length)}px`;
    island.appendChild(field);

    agents.forEach((agent, i) => field.appendChild(makeAgentEl(agent, i, onClick)));
    container.appendChild(island);
  }
}

export function countAgents(state: WorldState): { total: number; waiting: number } {
  const agents = state.projects.flatMap((p) => visibleAgents(p.agents));
  return { total: agents.length, waiting: agents.filter((a) => a.pendingQuestion).length };
}
