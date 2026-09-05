import './style.css';
import type { AgentInfo, WorldState } from '../shared/types';
import { fetchState } from './api';
import { renderIslands, countAgents } from './render';
import { openPanel, closePanel } from './panel';

const POLL_MS = 3000;

const islandsEl = document.getElementById('islands') as HTMLElement;
const summaryEl = document.getElementById('summary') as HTMLElement;
const updatedEl = document.getElementById('updated') as HTMLElement;
const emptyEl = document.getElementById('empty-state') as HTMLElement;
const errorEl = document.getElementById('error-state') as HTMLElement;

let openSessionId: string | null = null;

function findAgent(state: WorldState, sessionId: string): AgentInfo | undefined {
  return state.projects.flatMap((p) => p.agents).find((a) => a.sessionId === sessionId);
}

function handleAgentClick(agent: AgentInfo): void {
  openSessionId = agent.sessionId;
  openPanel(agent, refresh);
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

async function refresh(): Promise<void> {
  try {
    const state = await fetchState();
    errorEl.hidden = true;

    const { total, waiting } = countAgents(state);
    summaryEl.textContent = `${total} agent${total === 1 ? '' : 's'} across ${state.projects.length} island${
      state.projects.length === 1 ? '' : 's'
    }${waiting ? ` · ${waiting} waiting on you` : ''}`;
    updatedEl.textContent = `updated ${timeAgo(state.updatedAt)}`;
    emptyEl.hidden = total > 0;

    renderIslands(islandsEl, state, handleAgentClick);

    if (openSessionId) {
      const agent = findAgent(state, openSessionId);
      if (agent) {
        openPanel(agent, refresh);
      } else {
        closePanel();
        openSessionId = null;
      }
    }
  } catch (err) {
    errorEl.hidden = false;
    errorEl.textContent = `Couldn't reach csworld server: ${(err as Error).message}`;
  }
}

void refresh();
setInterval(refresh, POLL_MS);
