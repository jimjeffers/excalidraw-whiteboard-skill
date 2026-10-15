import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { prepareScene, prepareFile } from '../skills/whiteboard-share/scripts/prepare-plus.mjs';

const example = JSON.parse(await readFile(new URL('../examples/background-jobs.excalidraw', import.meta.url)));

test('legacy example arrows gain Plus dimensions and centered bindings without moving the drawing', () => {
  const source = structuredClone(example);
  const result = prepareScene(source);
  assert.deepEqual(source, example);
  assert.equal(result.scene.elements.length, 18);
  for (const id of ['request', 'enqueue', 'consume']) {
    const arrow = result.scene.elements.find(element => element.id === id);
    const before = example.elements.find(element => element.id === id);
    assert.equal(arrow.width, 214);
    assert(Math.abs(arrow.height) < 1e-10);
    assert.deepEqual(arrow.startBinding, { elementId: before.startBinding.elementId, mode: 'orbit', fixedPoint: [1, 0.5] });
    assert.deepEqual(arrow.endBinding, { elementId: before.endBinding.elementId, mode: 'orbit', fixedPoint: [0, 0.5] });
    assert.deepEqual([arrow.x, arrow.y, arrow.points], [before.x, before.y, before.points]);
  }
  const vertical = result.scene.elements.find(element => element.id === 'save');
  assert.deepEqual([vertical.width, vertical.height], [0, 154]);
  assert.deepEqual(vertical.startBinding.fixedPoint, [0.5, 1]);
  assert.deepEqual(vertical.endBinding.fixedPoint, [0.5, 0]);
  assert.deepEqual(result.scene.elements.filter(element => element.type !== 'arrow'), example.elements.filter(element => element.type !== 'arrow'));
  assert.deepEqual(result.scene.files, example.files);
  assert.deepEqual(result.scene.appState, example.appState);
});

test('current bindings and embedded files are preserved on repeat preparation', () => {
  const scene = prepareScene(example).scene;
  scene.elements.find(element => element.id === 'request').angle = 0.2;
  scene.files = { embedded: { dataURL: 'data:image/png;base64,AAAA', mimeType: 'image/png' } };
  assert.deepEqual(prepareScene(scene).scene, scene);
});

test('centered arrows from the local runtime tolerate floating-point focus rounding', async () => {
  const source = JSON.parse(await readFile(new URL('../examples/session-architecture.excalidraw', import.meta.url)));
  source.elements = source.elements.filter(element => ['chat-a', 'server-a', 'browser-a', 'launch-a', 'sync-a'].includes(element.id));
  const result = prepareScene(source);
  for (const id of ['launch-a', 'sync-a']) {
    const before = source.elements.find(element => element.id === id);
    const arrow = result.scene.elements.find(element => element.id === id);
    assert.notEqual(before.startBinding.focus, 0);
    assert.deepEqual(arrow.startBinding, { elementId: before.startBinding.elementId, mode: 'orbit', fixedPoint: [1, 0.5] });
    assert.deepEqual(arrow.endBinding, { elementId: before.endBinding.elementId, mode: 'orbit', fixedPoint: [0, 0.5] });
    assert.deepEqual([arrow.x, arrow.y, arrow.points], [before.x, before.y, before.points]);
  }
});

test('unsupported legacy geometry is rejected without guessing a binding', () => {
  for (const change of [
    scene => { scene.elements.find(element => element.id === 'request').angle = 0.2; },
    scene => { scene.elements.find(element => element.id === 'app').angle = 0.2; },
    scene => { scene.elements.find(element => element.id === 'request').startBinding.focus = 0.3; },
    scene => { scene.elements.find(element => element.id === 'request').startBinding.focus = null; },
    scene => { scene.elements.find(element => element.id === 'request').startBinding.elementId = 'missing'; },
  ]) {
    const scene = structuredClone(example);
    change(scene);
    assert.throws(() => prepareScene(scene), /re-export|legacy|binding/i);
  }
});

test('preparation writes a separate file and refuses to overwrite the source or an existing output', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'plus-prepare-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const source = join(dir, 'source.excalidraw');
  const output = join(dir, 'prepared.excalidraw');
  const bytes = JSON.stringify(example);
  await writeFile(source, bytes);
  const info = await prepareFile(source, output);
  assert.equal(info.elementCount, 18);
  assert.match(info.sourceSha256, /^[a-f0-9]{64}$/);
  assert.equal(await readFile(source, 'utf8'), bytes);
  assert.equal(JSON.parse(await readFile(output)).elements.find(element => element.id === 'save').height, 154);
  await assert.rejects(prepareFile(source, output), /exist/i);
  await assert.rejects(prepareFile(source, source), /exist|source/i);
  assert.equal(await readFile(source, 'utf8'), bytes);
});
