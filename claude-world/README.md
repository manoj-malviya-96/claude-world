# Agent World

A live, chattable island map of the Claude Code sessions running on this
machine. TypeScript + Vite frontend, TypeScript API server.

Each project is an island; each session (interactive or background) is a
character with a deterministic, funny Hollywood-archetype avatar (e.g. "The
Deprecated Wizard", "The Caffeinated Sommelier"). Drag agents around their
island - it sticks across reloads. Islands show what every agent is doing
right now, flag any stuck on an unanswered `AskUserQuestion`, and open into a
real chat thread pulled from that session's own transcript.

## Run

```sh
pnpm install
pnpm dev
```

This starts the API server (port 4173) and the Vite dev server (port 5173,
proxying `/api` to the backend) side by side. Open **http://localhost:5173**.

For a single-process, no-hot-reload run instead:

```sh
pnpm start
```

This builds the client and server once and serves everything from
**http://127.0.0.1:4173**. Both bind to localhost only.

Pick a different backend port with `AGENT_WORLD_PORT=<port>` (set it before
either command; `pnpm dev` reads it into the Vite proxy target too).

## Interacting with an agent

Click an agent to open its panel:

- **Chat** shows the real conversation from that session's transcript, and
  refreshes every couple seconds while the panel is open.
- **Sending a message** only works for an **idle background agent** - it runs
  `claude -p --resume <sessionId> "<message>"`, and the reply lands back in
  that session's own transcript for the chat thread to pick up.
- **Stop this agent** sends `SIGTERM` to a running background agent's pid
  (confirmed before it fires). This is scoped to background agents only.
- **Dismiss from map** hides a finished agent (no live pid) from the
  dashboard. This is purely a client-side hide - it never touches the
  transcript file on disk.

## Scope, honestly

- **Local machine only.** Data comes from `claude agents --json` and this
  machine's session transcripts under `~/.claude/projects/`. There's no local
  API for cloud or Remote Control sessions on other machines, so those don't
  appear here.
- **Live interactive terminal sessions are watch-only.** There's no stdin
  this server can reach from outside your terminal, so chat and stop are
  both disabled for `kind: "interactive"` agents - answer those in their own
  terminal, and close them there too.
- **Nothing here deletes a transcript.** "Stop" ends a process; "Dismiss"
  just hides a row in your browser's local storage. Conversation history on
  disk is never touched by this tool.
