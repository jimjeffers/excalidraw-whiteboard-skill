import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { root, upstream, environment, revision } from './runtime.mjs';

const { chromium } = await import(pathToFileURL(join(upstream, 'node_modules/playwright/index.mjs')));
const temp = mkdtempSync(join(tmpdir(), 'codex-whiteboard-verify-'));
const output = join(root, 'output/playwright');
mkdirSync(output, { recursive: true });
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const url = `http://127.0.0.1:${port}`;
const env = {
  ...environment(), PORT: String(port), EXPRESS_SERVER_URL: url,
  EXCALIDRAW_DATA_DIR: join(temp, 'state'), EXCALIDRAW_EXPORT_DIR: temp,
  EXCALIDRAW_NO_AUTOSTART: '1', LOG_FILE_PATH: join(temp, 'service.log'),
};
const checks = [];
const pass = text => { checks.push(text); console.log(`PASS ${text}`); };
let server, browser, mcp;
let serverLog = '';

async function eventually(fn, label, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try { const value = await fn(); if (value) return value; } catch { /* retry startup/sync */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${label}\n${serverLog}`);
}
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const done = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
  await done;
  clearTimeout(timer);
}
async function start() {
  server = spawn(process.execPath, [join(upstream, 'dist/server.js')], { cwd: upstream, env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', chunk => { serverLog += chunk; });
  server.stderr.on('data', chunk => { serverLog += chunk; });
  await eventually(async () => {
    const health = await fetch(`${url}/health`).then(r => r.json());
    return health.pid === server.pid && health.durable_state_enabled;
  }, 'isolated persistent server');
}
function cli(args, input) {
  const result = spawnSync(process.execPath, [join(upstream, 'dist/bin.js'), ...args], {
    cwd: root, env, input, encoding: 'utf8', timeout: 20000,
  });
  assert.equal(result.status, 0, `${args.join(' ')}\n${result.stderr}\n${result.stdout}`);
  return result.stdout;
}
async function elements() {
  return (await fetch(`${url}/api/elements`).then(r => r.json())).elements;
}
function connectMcp() {
  mcp = spawn(process.execPath, [join(upstream, 'dist/index.js')], { cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map();
  let nextId = 1;
  createInterface({ input: mcp.stdout }).on('line', line => {
    const message = JSON.parse(line);
    if (pending.has(message.id)) pending.get(message.id)(message);
  });
  mcp.stderr.on('data', () => {});
  return (method, params) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`MCP timeout: ${method}`)); }, 15000);
    pending.set(id, message => {
      clearTimeout(timer); pending.delete(id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    });
    mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}

try {
  await start();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const external = new Set();
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === url) return route.continue();
    external.add(route.request().url());
    return route.abort();
  });
  await page.goto(url);
  await page.getByRole('button', { name: 'Sync to Backend', exact: true }).waitFor();

  // A frame title is visible DOM produced by the actual canvas renderer.
  cli(['add', '-'], JSON.stringify([{ id: 'agent-frame', type: 'frame', name: 'Agent-created frame', x: 50, y: 50, width: 240, height: 140 }]));
  await page.getByText('Agent-created frame', { exact: true }).waitFor();
  pass('CLI-created frame appears in the already-open browser');

  // Make a human-style edit with real keyboard and pointer input.
  await page.mouse.click(850, 650);
  await page.keyboard.press('t');
  await page.mouse.click(450, 450);
  await page.keyboard.type('Browser round trip');
  await page.keyboard.press('Escape');
  const typed = await eventually(async () => (await elements()).find(e => e.text === 'Browser round trip'), 'browser autosync');
  assert.match(cli(['get', typed.id]), /Browser round trip/);
  pass('Browser text autosyncs and is readable by the CLI');

  cli(['update', typed.id, '--set', JSON.stringify({ text: 'Agent round trip' })]);
  await eventually(async () => (await elements()).find(e => e.id === typed.id && e.text === 'Agent round trip'), 'agent update');
  await page.mouse.dblclick(465, 460);
  const editor = page.locator('textarea.excalidraw-wysiwyg');
  await editor.waitFor({ state: 'visible' });
  await eventually(async () => (await editor.inputValue()) === 'Agent round trip', 'live browser update');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: join(output, 'round-trip.png') });
  pass('CLI update is present in the browser text editor without reload');

  await page.evaluate(() => document.fonts.ready);
  assert.equal(external.size, 0, `Unexpected external requests: ${[...external].join(', ')}`);
  pass('Exercised drawing flow loads with zero external HTTP requests');
  await browser.close(); browser = null;

  const rpc = connectMcp();
  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'local-whiteboard-verifier', version: '0.1.0' } });
  mcp.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  const discovery = await rpc('tools/list', {});
  assert(discovery.tools.some(tool => tool.name === 'get_element'));
  const read = await rpc('tools/call', { name: 'get_element', arguments: { id: typed.id } });
  assert(!read.isError);
  assert.match(JSON.stringify(read.content), /Agent round trip/);
  const created = await rpc('tools/call', { name: 'create_element', arguments: { id: 'mcp-proof', type: 'rectangle', x: 700, y: 100, width: 180, height: 80, text: 'MCP created this' } });
  assert(!created.isError, JSON.stringify(created));
  assert((await elements()).some(e => e.id === 'mcp-proof'));
  pass(`MCP discovers ${discovery.tools.length} tools and reads/writes the same canvas`);
  await stop(mcp); mcp = null;

  cli(['snapshot', 'save', 'verification']);
  const exported = join(temp, 'round-trip.excalidraw');
  cli(['export', '--out', exported]);
  const saved = JSON.parse(readFileSync(exported, 'utf8'));
  assert.equal(saved.type, 'excalidraw');
  assert(saved.elements.some(e => e.id === typed.id && e.text === 'Agent round trip'));
  cli(['screenshot', '--out', join(temp, 'scene.png')]);
  const png = readFileSync(join(temp, 'scene.png'));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert(png.length > 1000);
  pass('Portable .excalidraw export and headless PNG render succeed');

  const before = (await elements()).map(e => e.id).sort();
  await stop(server);
  await start();
  assert.deepEqual((await elements()).map(e => e.id).sort(), before);
  assert.match(cli(['get', typed.id]), /Agent round trip/);
  assert.match(cli(['snapshot', 'list']), /verification/);
  pass('Scene and named snapshot survive service restart');

  cli(['clear', '--yes']);
  cli(['import', exported, '--replace']);
  assert.deepEqual((await elements()).map(e => e.id).sort(), saved.elements.map(e => e.id).sort());
  assert.match(cli(['get', typed.id]), /Agent round trip/);
  pass('Export reimports with element IDs and browser-edited text preserved');

  writeFileSync(join(output, 'verification.json'), JSON.stringify({ checkedAt: new Date().toISOString(), upstreamRevision: revision, node: process.version, checks, fixtureDirectory: temp }, null, 2));
} finally {
  if (browser) await browser.close();
  await stop(mcp);
  await stop(server);
}
