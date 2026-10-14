import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { checkLayout } from '../skills/whiteboard/scripts/check-layout.mjs';

const executable = fileURLToPath(new URL('../skills/whiteboard/scripts/check-layout.mjs', import.meta.url));
function scene(gap = 240, vertical = false) {
  return { elements: [
    { id: 'a', type: 'rectangle', x: 0, y: 0, width: 300, height: 100 },
    { id: 'b', type: 'rectangle', x: vertical ? 0 : 300 + gap, y: vertical ? 100 + gap : 0, width: 300, height: 100 },
    { id: 'edge', type: 'arrow', x: vertical ? 150 : 308, y: vertical ? 108 : 50,
      points: [[0, 0], vertical ? [0, gap - 16] : [gap - 16, 0]],
      startBinding: { elementId: 'a' }, endBinding: { elementId: 'b' },
      boundElements: [{ id: 'caption', type: 'text' }] },
    { id: 'caption', type: 'text', text: 'request / reply', containerId: 'edge', fontSize: 20,
      x: vertical ? 78 : 300 + gap / 2 - 72, y: vertical ? 100 + gap / 2 - 12.5 : 37.5, width: 144, height: 25 },
  ] };
}
const codes = data => checkLayout(data).issues.map(i => i.code);

test('a single bound label with visible shaft on each side passes without modifying the scene', () => {
  const input = scene();
  const before = structuredClone(input);
  assert.deepEqual(codes(input), []);
  assert.equal(checkLayout(input).checkedConnectors, 1);
  assert.deepEqual(input, before);
});
test('a crowded connector reports its label overlap and insufficient shaft space', () => {
  const issues = codes(scene(110));
  assert(issues.includes('label-overlap'));
  assert(issues.includes('connector-space'));
});
test('a nearby standalone copy is detected even when its line breaks differ', () => {
  const input = scene();
  input.elements.push({ id: 'copy', type: 'text', text: 'request /\nreply', x: 350, y: -10, width: 80, height: 40 });
  const issue = checkLayout(input).issues.find(i => i.code === 'duplicate-label');
  assert(issue);
  assert.deepEqual(new Set(issue.elementIds), new Set(['edge', 'caption', 'copy']));
});
test('identical text elsewhere and deleted copies are not duplicates', () => {
  const input = scene();
  input.elements.push({ id: 'far', type: 'text', text: 'request / reply', x: 2000, y: 0, width: 144, height: 25 });
  input.elements.push({ id: 'deleted', type: 'text', text: 'request / reply', x: 350, y: 10, width: 144, height: 25, isDeleted: true });
  assert.deepEqual(codes(input), []);
});
test('multiple text elements attached to one arrow are reported', () => {
  const input = scene();
  input.elements.push({ ...input.elements[3], id: 'second-caption', text: 'another caption', y: -20 });
  assert(codes(input).includes('multiple-labels'));
});
test('vertical connectors reserve room for label height and arrow shafts', () => {
  assert(codes(scene(60, true)).includes('connector-space'));
  assert.deepEqual(codes(scene(150, true)), []);
});
test('reversing a straight arrow does not change the spacing result', () => {
  const input = scene(110);
  const edge = input.elements[2];
  edge.x += edge.points[1][0];
  edge.points[1][0] *= -1;
  [edge.startBinding, edge.endBinding] = [edge.endBinding, edge.startBinding];
  assert(codes(input).includes('connector-space'));
});
test('diagonal connectors explicitly require visual review', () => {
  const input = scene();
  input.elements[2].points[1][1] = 120;
  const report = checkLayout(input);
  assert(report.manualReview.some(i => i.elementId === 'edge'));
});
test('malformed exports fail instead of reporting a clean scene', () => {
  assert.throws(() => checkLayout({}), /elements/i);
  const input = scene();
  delete input.elements[3].width;
  assert(checkLayout(input).manualReview.some(i => i.elementId === 'caption'));
});
test('CLI reports issues, preserves the input file, and distinguishes invalid input', t => {
  const dir = mkdtempSync(join(tmpdir(), 'whiteboard-layout-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'board.excalidraw');
  const input = JSON.stringify(scene(110));
  writeFileSync(file, input);
  const bad = spawnSync(process.execPath, [executable, file], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert(JSON.parse(bad.stdout).issues.length > 0);
  assert.equal(readFileSync(file, 'utf8'), input);
  writeFileSync(file, JSON.stringify(scene()));
  assert.equal(spawnSync(process.execPath, [executable, file]).status, 0);
  writeFileSync(file, 'not json');
  assert.equal(spawnSync(process.execPath, [executable, file]).status, 2);
});
