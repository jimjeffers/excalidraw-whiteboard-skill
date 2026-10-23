// These checks catch cross-board routing, accidental reuse, lost persistence,
// duplicate process launches, and signaling a process owned by another board.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, upstream } from './runtime.mjs';

const home = mkdtempSync(join(tmpdir(), 'whiteboard-session-check-'));
mkdirSync(join(home, 'project one'));
const project = realpathSync(join(home, 'project one'));
const executable = process.env.WHITEBOARD_TEST_SCRIPT || join(root, 'skills/whiteboard/scripts/session.mjs');
const env = { ...process.env, WHITEBOARD_HOME: home, WHITEBOARD_RUNTIME: process.env.WHITEBOARD_TEST_RUNTIME || upstream };
const sessions = [];
const checks = [];
const pass = message => { checks.push(message); console.log(`PASS ${message}`); };
function invoke(args, { input, fail = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [executable, ...args], { env, cwd: tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    child.stdout.on('data', data => { out += data; });
    child.stderr.on('data', data => { err += data; });
    child.stdin.end(input);
    const timer = setTimeout(() => { child.kill(); reject(new Error(`Timeout: ${args.join(' ')}`)); }, 30000);
    child.on('exit', code => {
      clearTimeout(timer);
      if (fail) {
        try { assert.notEqual(code, 0, 'Command must refuse an unsafe route'); resolve({ out, err }); }
        catch (error) { reject(error); }
      } else if (code !== 0) reject(new Error(`${args.join(' ')} failed: ${err || out}`));
      else resolve(out);
    });
    child.on('error', reject);
  });
}
const json = async args => JSON.parse(await invoke(args));
try {
  const a = await json(['start', '--project', project, '--name', 'API design']);
  sessions.push(a.id);
  const b = await json(['start', '--project', project, '--name', 'API design']);
  sessions.push(b.id);
  assert.notEqual(a.id, b.id);
  assert.notEqual(a.url, b.url);
  await invoke(['run', a.id, 'add', '-'], { input: JSON.stringify([{ id: 'only-in-a', type: 'rectangle', x: 50, y: 80, width: 220, height: 80, text: 'Session A only' }]) });
  assert.match(await invoke(['run', a.id, 'get', 'only-in-a']), /Session A only/);
  assert.doesNotMatch(await invoke(['run', b.id, 'query']), /only-in-a/);
  pass('Same-name sessions have isolated canvases and distinct ports');

  const reopened = await json(['open', a.id]);
  assert.equal(reopened.pid, a.pid);
  const listing = await json(['list', '--project', project]);
  assert.equal(listing.length, 2);
  assert(listing.every(s => s.project === project && s.status === 'running'));
  assert.equal((await json(['list', '--project', root])).length, 0);
  pass('Explicit reopening reuses its process and project listing is scoped');

  const stolen = await invoke(['run', a.id, '--url', b.url, 'clear', '--yes'], { fail: true });
  assert.match(stolen.err, /url|routing|command/i);
  await invoke(['run', '../outside', 'query'], { fail: true });
  pass('CLI URL overrides and invalid session paths are rejected');

  await invoke(['run', a.id, 'snapshot', 'save', 'before-stop']);
  await invoke(['run', a.id, 'export', '--out', 'saved.excalidraw']);
  const saved = JSON.parse(readFileSync(join(project, 'saved.excalidraw'), 'utf8'));
  assert(saved.elements.some(e => e.id === 'only-in-a'));
  await invoke(['stop', a.id]);
  const opened = await Promise.all([json(['open', a.id]), json(['open', a.id])]);
  assert.equal(opened[0].pid, opened[1].pid);
  assert.notEqual(opened[0].pid, a.pid);
  assert.match(await invoke(['run', a.id, 'get', 'only-in-a']), /Session A only/);
  assert.match(await invoke(['run', a.id, 'snapshot', 'list']), /before-stop/);
  await invoke(['run', a.id, 'screenshot', '--out', 'preview.png']);
  assert.equal(readFileSync(join(project, 'preview.png')).subarray(1, 4).toString(), 'PNG');
  pass('Concurrent reopen starts one process; state, snapshots, exports, and rendering work');

  const origin = new URL(opened[0].url).origin;
  assert.equal((await fetch(`${origin}/api/elements`)).status, 401);
  assert.equal((await fetch(`${origin}/api/elements/clear`, { method: 'DELETE', headers: { Origin: 'https://example.com' } })).status, 403);
  // fetch() does not send a caller-supplied Host header, so use http.request for a rebound hostname.
  const reboundStatus = await new Promise((resolve, reject) => {
    request(`${origin}/api/elements`, { headers: { Host: `example.com:${new URL(origin).port}` } }, res => { res.resume(); resolve(res.statusCode); })
      .on('error', reject).end();
  });
  assert.equal(reboundStatus, 421);
  assert.match(await invoke(['run', a.id, 'get', 'only-in-a']), /Session A only/);
  pass('Requests without the token, from other origins, or for other hosts are refused');

  // Exercise the copied runtime's static assets and browser sync through the
  // session helper. Missing frontend dependencies must not hide behind /health.
  const { chromium } = await import(pathToFileURL(join(upstream, 'node_modules/playwright/index.mjs')));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const external = new Set();
    await page.route('**/*', route => {
      if (new URL(route.request().url()).origin === new URL(opened[0].url).origin) return route.continue();
      external.add(route.request().url());
      return route.abort();
    });
    await page.goto(opened[0].url);
    await page.getByRole('button', { name: 'Sync to Backend', exact: true }).waitFor();
    await invoke(['run', a.id, 'add', '-'], { input: JSON.stringify([{ id: 'skill-frame', type: 'frame', name: 'Reusable skill session', x: 700, y: 100, width: 360, height: 240 }]) });
    await page.getByText('Reusable skill session', { exact: true }).waitFor();
    await page.mouse.click(850, 650);
    await page.keyboard.press('t');
    await page.mouse.click(450, 450);
    await page.keyboard.type('Browser edit in session A');
    await page.keyboard.press('Escape');
    let observed = false;
    for (let i = 0; i < 25; i++) {
      if ((await invoke(['run', a.id, 'query'])).includes('Browser edit in session A')) { observed = true; break; }
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert(observed, 'Browser edit must reach this session');
    assert.doesNotMatch(await invoke(['run', b.id, 'query']), /Browser edit in session A/);
    assert.equal(external.size, 0, `External assets: ${[...external].join(', ')}`);
    mkdirSync(join(root, 'output/whiteboard'), { recursive: true });
    await page.screenshot({ path: join(root, 'output/whiteboard/skill-session.png') });
    pass('Installed frontend renders and browser edits sync only to the selected session, without external assets');
  } finally { await browser.close(); }

  // A real second session occupies the alleged endpoint; identity must win over port.
  const metadataPath = join(home, 'sessions', a.id, 'session.json');
  const original = readFileSync(metadataPath, 'utf8');
  const redirected = { ...JSON.parse(original), port: Number(new URL(b.url).port), pid: b.pid };
  writeFileSync(metadataPath, JSON.stringify(redirected));
  try {
    await invoke(['run', a.id, 'clear', '--yes'], { fail: true });
    await invoke(['stop', a.id], { fail: true });
    const bToken = JSON.parse(readFileSync(join(home, 'sessions', b.id, 'session.json'), 'utf8')).token;
    assert.equal((await fetch(`${new URL(b.url).origin}/health`, { headers: { 'x-whiteboard-token': bToken } }).then(r => r.json())).pid, b.pid);
    pass('Mismatched session identity blocks both mutations and process termination');
  } finally { writeFileSync(metadataPath, original); }

  mkdirSync(join(root, 'output/whiteboard'), { recursive: true });
  writeFileSync(join(root, 'output/whiteboard/sessions.json'), JSON.stringify({ checkedAt: new Date().toISOString(), checks, fixtureDirectory: home }, null, 2));
} finally {
  for (const id of sessions) await invoke(['stop', id]).catch(error => console.error(error.message));
}
