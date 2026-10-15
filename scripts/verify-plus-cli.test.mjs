import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const cliPackage = '@excalidraw/cli@0.2.0';
const fakeKey = 'uk-local-test-not-a-real-key';

async function fixture(t, { failContent = false } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'whiteboard-plus-'));
  const file = join(dir, 'board.excalidraw');
  const scene = JSON.parse(await readFile(new URL('../examples/background-jobs.excalidraw', import.meta.url)));
  scene.elements.push({ ...scene.elements[0], id: 'image-element', type: 'image', fileId: 'image-file', status: 'saved', scale: [1, 1] });
  scene.files = {
    'image-file': {
      id: 'image-file', mimeType: 'image/png', created: 1,
      dataURL: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
    },
  };
  await writeFile(file, JSON.stringify(scene));
  const calls = [];
  let stored;
  const server = createServer(async (request, response) => {
    try {
      assert.equal(request.headers.authorization, `Bearer ${fakeKey}`);
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : undefined;
      calls.push({ method: request.method, url: request.url, body });
      response.setHeader('content-type', 'application/json');
      if (request.method === 'GET' && request.url === '/api/v1/workspaces') {
        response.end(JSON.stringify({ id: 'test-workspace', name: 'Local verification', subscriptionStatus: 'active' }));
      } else if (request.method === 'POST' && request.url === '/api/v1/scenes') {
        response.end(JSON.stringify({ metadata: { id: 'created-scene', name: body.name, collection: body.collectionId } }));
      } else if (request.method === 'PUT' && request.url === '/api/v1/scenes/created-scene/content') {
        if (failContent) {
          response.statusCode = 503;
          response.end(JSON.stringify({ message: 'Simulated content failure' }));
        } else {
          stored = body;
          response.end(JSON.stringify(body));
        }
      } else if (request.method === 'GET' && request.url === '/api/v1/scenes/created-scene/content') {
        response.end(JSON.stringify(stored));
      } else {
        response.statusCode = 404;
        response.end(JSON.stringify({ message: 'Unexpected test request' }));
      }
    } catch (error) {
      response.statusCode = 500;
      response.end(JSON.stringify({ message: error.message }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  });
  function run(...args) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', [
        '--yes', cliPackage, ...args,
        '--api-url', origin, '--retries', '0', '--request-timeout', '3000', '--output', 'json',
      ], {
        cwd: dir,
        env: { ...process.env, EXCALIDRAW_API_KEY: fakeKey, EXCALIDRAW_NO_UPDATE_NOTIFIER: '1', XDG_CONFIG_HOME: join(dir, 'config') },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', data => { stdout += data; });
      child.stderr.on('data', data => { stderr += data; });
      child.once('error', reject);
      child.once('close', code => resolve({ code, stdout, stderr }));
    });
  }
  return { dir, file, scene, calls, run };
}

test('official CLI identifies the account and imports a native scene with embedded images intact', async t => {
  const { dir, file, scene, calls, run } = await fixture(t);
  const before = await readFile(file, 'utf8');
  const identity = await run('whoami');
  assert.equal(identity.code, 0, identity.stderr);
  assert.equal(JSON.parse(identity.stdout).workspace.id, 'test-workspace');
  assert(!identity.stdout.includes(fakeKey));
  const created = await run('scenes', 'create', '--name', 'Import check', '--collection-id', 'private', '--file', file);
  assert.equal(created.code, 0, created.stderr);
  assert.equal(JSON.parse(created.stdout).metadata.id, 'created-scene');
  const output = join(dir, 'download.excalidraw');
  const downloaded = await run('scenes', 'content', 'get', 'created-scene', '--out', output);
  assert.equal(downloaded.code, 0, downloaded.stderr);
  const actual = JSON.parse(await readFile(output, 'utf8'));
  assert.deepEqual(actual.elements, scene.elements);
  assert.deepEqual(actual.files, scene.files);
  assert.deepEqual(actual.appState, scene.appState);
  assert.equal(calls.filter(call => call.method === 'POST').length, 1);
  assert.equal(calls.find(call => call.method === 'POST').body.collectionId, 'private');
  assert.equal(await readFile(file, 'utf8'), before);
});

test('official CLI rejects an invalid export before creating a remote scene', async t => {
  const { file, calls, run } = await fixture(t);
  await writeFile(file, JSON.stringify({ type: 'excalidraw', elements: 'invalid' }));
  const result = await run('scenes', 'create', '--name', 'Invalid', '--collection-id', 'private', '--file', file);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /no scene was created/);
  assert.equal(calls.length, 0);
});

test('official CLI reports the created scene ID after a content failure without repeating creation', async t => {
  const { file, calls, run } = await fixture(t, { failContent: true });
  const result = await run('scenes', 'create', '--name', 'Partial import', '--collection-id', 'private', '--file', file);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Scene created-scene was created, but writing its content failed/);
  assert.deepEqual(calls.map(({ method }) => method), ['POST', 'PUT']);
});
