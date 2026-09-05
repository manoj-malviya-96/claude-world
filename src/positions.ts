// Drag positions persist locally so an agent stays where you dropped it
// across polls and reloads.
const KEY = 'agent-world:positions';

interface Pos {
  x: number;
  y: number;
}

function load(): Record<string, Pos> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

const positions = load();

export function getPosition(sessionId: string): Pos | undefined {
  return positions[sessionId];
}

export function setPosition(sessionId: string, pos: Pos): void {
  positions[sessionId] = pos;
  localStorage.setItem(KEY, JSON.stringify(positions));
}
