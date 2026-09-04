#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { createApp } from './app.js';
const HOST = '127.0.0.1'; // local-only: this process can spawn `claude` and kill pids, never expose it
const DEFAULT_PORT = 4173;
function parsePort(argv) {
    const flagIndex = argv.indexOf('--port');
    const flagValue = flagIndex !== -1 ? argv[flagIndex + 1] : undefined;
    const raw = flagValue ?? process.env.CSWORLD_PORT ?? String(DEFAULT_PORT);
    const port = Number(raw);
    if (!Number.isInteger(port) || port <= 0) {
        throw new Error(`invalid port "${raw}" (from ${flagValue ? '--port' : 'CSWORLD_PORT'})`);
    }
    return port;
}
// Best-effort only: on a headless box or over SSH there's no browser to pop,
// and that's fine - the URL is already printed.
function openBrowser(url) {
    const [command, args] = process.platform === 'darwin'
        ? ['open', [url]]
        : process.platform === 'win32'
            ? ['cmd', ['/c', 'start', '""', url]]
            : ['xdg-open', [url]];
    execFile(command, args, () => { });
}
const port = parsePort(process.argv.slice(2));
const openOnStart = !process.argv.includes('--no-open');
createApp().listen(port, HOST, () => {
    const url = `http://${HOST}:${port}`;
    console.log(`csworld running at ${url}`);
    if (openOnStart)
        openBrowser(url);
});
