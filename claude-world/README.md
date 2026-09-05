# Claude World

A live, chattable island map of the Claude Code sessions running on this
machine. Ships as `csworld`, an installable CLI.

Each project is an island; each session (interactive or background) is a
character with a deterministic, funny Hollywood-archetype avatar (e.g. "The
Deprecated Wizard", "The Caffeinated Sommelier"). Drag agents around their
island - it sticks across reloads. Islands show what every agent is doing
right now, flag any stuck on an unanswered `AskUserQuestion`, and open into a
real chat thread pulled from that session's own transcript.

## Install and run

Published to GitHub Packages, not npmjs.org, so npm needs to know where to
find the `@manoj-malviya-96` scope and needs a token to read it (GitHub
Packages requires auth even for public packages). Add to `~/.npmrc`:

```
@manoj-malviya-96:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=<a GitHub PAT with read:packages>
```

Then:

```sh
npm install -g @manoj-malviya-96/csworld
csworld
```

This starts the server on **http://127.0.0.1:4173** (localhost only) and
opens it in your browser. Useful flags:

```sh
csworld --port 4200   # use a different port
csworld --no-open     # don't launch a browser
```

`CSWORLD_PORT` works as an env var alternative to `--port`.

## Developing this package

```sh
pnpm install
pnpm dev
```

Runs the API server (`tsx watch`, port 4173) and the Vite dev server (port
5173, proxying `/api` to the backend) side by side with hot reload. Open
whatever port Vite prints.

```sh
pnpm build   # compile server + bundle client into dist/
pnpm start   # build, then run the real CLI entrypoint once
```

`vite` and `typescript` are devDependencies only - the published package has
zero runtime dependencies, so `npm install -g` stays fast and the CLI starts
instantly. `dist/` (prebuilt client + compiled server) is what actually ships;
`prepublishOnly` rebuilds it automatically before `npm publish`.

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
