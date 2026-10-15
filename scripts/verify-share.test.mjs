import assert from 'node:assert/strict';
import { createDecipheriv } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import test from 'node:test';

const script = fileURLToPath(new URL('../skills/whiteboard-share/scripts/share.mjs', import.meta.url));
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'whiteboard-share-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'board.excalidraw');
  const scene = JSON.parse(readFileSync(new URL('../examples/background-jobs.excalidraw', import.meta.url)));
  scene.appState.viewBackgroundColor = '#102030';
  scene.appState.selectedElementIds = { privateSelection: true };
  scene.elements.push({ ...scene.elements[0], id: 'removed', isDeleted: true });
  writeFileSync(file, JSON.stringify(scene));
  return { dir, file, scene, receipt: join(dir, 'share.json') };
}

// Decode the published wire format independently with Node's cipher API.
function chunks(input) {
  const buffer = Buffer.from(input);
  assert.equal(buffer.readUInt32BE(0), 1);
  const parts = [];
  for (let offset = 4; offset < buffer.length;) {
    const size = buffer.readUInt32BE(offset);
    parts.push(buffer.subarray(offset + 4, offset + 4 + size));
    offset += 4 + size;
  }
  return parts;
}
function decode(payload, key) {
  const [metadata, iv, encrypted] = chunks(payload);
  assert.deepEqual(JSON.parse(metadata), { version: 2, compression: 'pako@1', encryption: 'AES-GCM' });
  const cipher = createDecipheriv('aes-128-gcm', Buffer.from(key, 'base64url'), iv);
  cipher.setAuthTag(encrypted.subarray(-16));
  const plain = Buffer.concat([cipher.update(encrypted.subarray(0, -16)), cipher.final()]);
  return JSON.parse(chunks(inflateSync(plain))[1]);
}

test('inspect works through an installed symlink, preserves the file, and makes no upload', t => {
  const { dir, file } = fixture(t);
  const before = readFileSync(file, 'utf8');
  const direct = spawnSync(process.execPath, [script, 'inspect', file], { encoding: 'utf8' });
  assert.equal(direct.status, 0, direct.stderr);
  const summary = JSON.parse(direct.stdout);
  assert.equal(summary.elementCount, 18);
  assert.match(summary.sha256, /^[0-9a-f]{64}$/);
  assert.equal(summary.uploaded, false);
  assert.equal(readFileSync(file, 'utf8'), before);
  symlinkSync(dirname(script), join(dir, 'scripts'), 'dir');
  const linked = spawnSync(process.execPath, [join(dir, 'scripts/share.mjs'), 'inspect', file], { encoding: 'utf8' });
  assert.equal(linked.status, 0, linked.stderr);
  assert.deepEqual(JSON.parse(linked.stdout), summary);
});

test('upload preserves diagram data, encrypts before POST, verifies retrieval, and reuses its receipt', async t => {
  const { inspectFile, uploadFile } = await import(script);
  const { file, scene, receipt } = fixture(t);
  const before = readFileSync(file, 'utf8');
  const { sha256 } = await inspectFile(file);
  let payload;
  const requests = [];
  const transport = async (url, options = {}) => {
    requests.push(url);
    if (options.method === 'POST') {
      payload = Buffer.from(options.body);
      assert(!payload.includes(Buffer.from('Web app')));
      assert.equal(options.redirect, 'error');
      return Response.json({ id: 'example-board' });
    }
    return new Response(payload);
  };
  const result = await uploadFile(file, { sha256, receipt }, transport);
  const url = new URL(result.url);
  assert.equal(url.origin, 'https://excalidraw.com');
  const [, key] = url.hash.slice('#json='.length).split(',');
  assert.deepEqual(decode(payload, key).elements, scene.elements.filter(e => !e.isDeleted));
  assert.deepEqual(decode(payload, key).appState, { viewBackgroundColor: '#102030', gridSize: null });
  assert(requests.every(request => !request.includes(key)));
  assert.equal(result.status, 'verified');
  assert.equal(JSON.parse(readFileSync(receipt)).url, result.url);
  assert.equal(statSync(receipt).mode & 0o777, 0o600);
  assert.equal(readFileSync(file, 'utf8'), before);
  assert.equal((await uploadFile(file, { sha256, receipt }, transport)).url, result.url);
  assert.equal(requests.length, 2, 'A repeated command must not create another remote snapshot');
});

test('changed input, missing upload options, and image scenes fail before network access', async t => {
  const { inspectFile, uploadFile } = await import(script);
  const { file, scene, receipt } = fixture(t);
  const { sha256 } = await inspectFile(file);
  const noNetwork = () => { assert.fail('Unexpected network access'); };
  await assert.rejects(uploadFile(file, { receipt }, noNetwork), /sha256/i);
  await assert.rejects(uploadFile(file, { sha256 }, noNetwork), /receipt/i);
  writeFileSync(file, JSON.stringify({ ...scene, source: 'changed' }));
  await assert.rejects(uploadFile(file, { sha256, receipt }, noNetwork), /changed/i);
  scene.elements[0].type = 'image';
  writeFileSync(file, JSON.stringify(scene));
  await assert.rejects(inspectFile(file), /image/i);
  writeFileSync(file, JSON.stringify({ ...scene, elements: [] }));
  await assert.rejects(inspectFile(file), /empty/i);
});

test('an uncertain POST is recorded and never automatically retried', async t => {
  const { inspectFile, uploadFile } = await import(script);
  const { file, receipt } = fixture(t);
  const { sha256 } = await inspectFile(file);
  let requests = 0;
  const transport = async () => { requests++; throw new Error('Connection closed'); };
  await assert.rejects(uploadFile(file, { sha256, receipt }, transport), /receipt|uncertain/i);
  assert.equal(JSON.parse(readFileSync(receipt)).status, 'uncertain');
  await assert.rejects(uploadFile(file, { sha256, receipt }, transport), /receipt|uncertain/i);
  assert.equal(requests, 1);
});

test('a failed download keeps the uploaded link available for verification without another POST', async t => {
  const { inspectFile, uploadFile } = await import(script);
  const { file, receipt } = fixture(t);
  const { sha256 } = await inspectFile(file);
  let posts = 0;
  let payload;
  const result = await uploadFile(file, { sha256, receipt }, async (url, options = {}) => {
    if (options.method === 'POST') { posts++; payload = options.body; return Response.json({ id: 'verify-later' }); }
    return new Response('unavailable', { status: 503 });
  });
  assert.equal(result.status, 'uploaded');
  assert.match(result.url, /#json=verify-later,/);
  const verified = await uploadFile(file, { sha256, receipt }, async (url, options = {}) => {
    assert.notEqual(options.method, 'POST');
    return new Response(payload);
  });
  assert.equal(verified.status, 'verified');
  assert.equal(posts, 1);
});

test('a receipt write failure after verification still returns the successfully uploaded link', async t => {
  const { inspectFile, uploadFile } = await import(script);
  const { file, receipt } = fixture(t);
  const { sha256 } = await inspectFile(file);
  let payload;
  const result = await uploadFile(file, { sha256, receipt }, async (url, options = {}) => {
    if (options.method === 'POST') { payload = options.body; return Response.json({ id: 'keep-link' }); }
    rmSync(receipt);
    mkdirSync(receipt);
    return new Response(payload);
  });
  assert.match(result.url, /#json=keep-link,/);
  assert.equal(result.status, 'verified');
  assert(result.receiptError);
});
