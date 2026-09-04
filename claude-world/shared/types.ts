export type SessionKind = 'interactive' | 'background';

export interface AgentInfo {
  sessionId: string;
  pid: number | null;
  kind: SessionKind;
  status: string;
  startedAt: number;
  displayName: string;
  avatarName: string;
  avatarEmoji: string;
  avatarColor: string;
  lastActivity: string | null;
  lastTimestamp: string | null;
  pendingQuestion: string | null;
  /** Can accept a chat message right now (idle background agent). */
  canReply: boolean;
  /** Can be stopped from the dashboard (any background agent with a live pid). */
  canStop: boolean;
}

export interface ProjectInfo {
  path: string;
  name: string;
  agents: AgentInfo[];
}

export interface WorldState {
  projects: ProjectInfo[];
  updatedAt: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: string | null;
}

export interface ChatLog {
  sessionId: string;
  messages: ChatMessage[];
}
