// Runs the API server (tsx watch) and the Vite dev server side by side,
// and tears both down together on Ctrl+C. Avoids adding a "run two things"
// dependency for what's a two-line spawn.
import { spawn } from 'node:child_process';

const children = [
  spawn('npx', ['tsx', 'watch', 'server/index.ts'], { stdio: 'inherit' }),
  spawn('npx', ['vite'], { stdio: 'inherit' }),
];

function shutdown() {
  for (const child of children) child.kill('SIGTERM');
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
for (const child of children) child.on('exit', shutdown);
