// Add launch identity and access checks without modifying the upstream editor or server source.
import { readFileSync } from 'node:fs';
import { Server } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkRequest, isPage } from './access.mjs';

const access = { port: process.env.PORT, token: process.env.WHITEBOARD_TOKEN };
if (!access.token) throw new Error('WHITEBOARD_TOKEN is required; start boards through session.mjs.');

const scriptDir = dirname(fileURLToPath(import.meta.url));
const shell = readFileSync(join(process.env.WHITEBOARD_RUNTIME, 'dist/frontend/index.html'), 'utf8');
if (!shell.includes('<head>')) throw new Error('Unexpected editor page; cannot add the access script.');
const script = readFileSync(join(scriptDir, 'browser-auth.js'), 'utf8');
const page = shell.replace('<head>', () => `<head>\n<script>${script}</script>`);

// The upstream server registers CORS and its routes when imported and does not
// export its HTTP server, so check requests and WebSocket upgrades as they arrive.
const emit = Server.prototype.emit;
Server.prototype.emit = function (event, req, target, ...rest) {
  if (event !== 'request' && event !== 'upgrade') return emit.call(this, event, req, target, ...rest);
  const result = checkRequest(req, access, { upgrade: event === 'upgrade' });
  if (result.ok && event === 'request' && isPage(result.path)) {
    target.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
    target.end(req.method === 'HEAD' ? undefined : page);
    return true;
  }
  if (result.ok) return emit.call(this, event, req, target, ...rest);
  if (event === 'upgrade') {
    target.end(`HTTP/1.1 ${result.status} Refused\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  } else {
    target.writeHead(result.status, { 'Content-Type': 'text/plain; charset=utf-8' });
    target.end(`${result.message}\n`);
  }
  return true;
};

const { default: app, startServer } = await import(pathToFileURL(join(process.env.WHITEBOARD_RUNTIME, 'dist/server.js')));
app.get('/__whiteboard/session', (_req, res) => {
  res.json({ id: process.env.WHITEBOARD_SESSION_ID, instance: process.env.WHITEBOARD_INSTANCE_ID, pid: process.pid });
});
await startServer();
