#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pair = value => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
const near = (a, b) => Math.abs(a - b) < 1e-6;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const unsupported = id => new Error(`Unsupported legacy binding on ${id}. Re-export with a current Excalidraw editor before importing into Plus; no binding was guessed.`);

function migrateBinding(arrow, binding, side, elements) {
  if (!binding) return binding;
  if (['inside', 'orbit', 'skip'].includes(binding.mode) && pair(binding.fixedPoint)) return binding;
  const target = elements.get(binding.elementId);
  // Only the local runtime's unrotated, centered straight connectors have an
  // unambiguous migration here. Other legacy geometry needs the editor's restore path.
  if (binding.mode || !target || arrow.elbowed || (arrow.angle ?? 0) !== 0
    || (target.angle ?? 0) !== 0 || !Number.isFinite(binding.focus) || !near(binding.focus, 0)
    || !['rectangle', 'ellipse', 'diamond'].includes(target.type)
    || ![target.x, target.y, target.width, target.height].every(Number.isFinite)
    || target.width <= 0 || target.height <= 0 || arrow.points.length !== 2) throw unsupported(arrow.id);
  const [first, last] = arrow.points;
  const point = side === 'start' ? first : last;
  const x = arrow.x + point[0];
  const y = arrow.y + point[1];
  let fixedPoint;
  if (near(first[1], last[1]) && near(y, target.y + target.height / 2)) {
    if (x >= target.x + target.width) fixedPoint = [1, 0.5];
    else if (x <= target.x) fixedPoint = [0, 0.5];
  } else if (near(first[0], last[0]) && near(x, target.x + target.width / 2)) {
    if (y >= target.y + target.height) fixedPoint = [0.5, 1];
    else if (y <= target.y) fixedPoint = [0.5, 0];
  }
  if (!fixedPoint) throw unsupported(arrow.id);
  // Plus schema: fixedPoint is relative to the target; orbit keeps an outside attachment.
  return { elementId: binding.elementId, fixedPoint, mode: 'orbit' };
}

export function prepareScene(input) {
  if (input?.type !== 'excalidraw' || input.version !== 2 || !Array.isArray(input.elements)) {
    throw new Error('Expected a version 2 .excalidraw export.');
  }
  const scene = structuredClone(input);
  const elements = new Map(scene.elements.map(element => [element.id, element]));
  const changes = [];
  for (const element of scene.elements) {
    const fields = [];
    if (['arrow', 'line', 'freedraw'].includes(element.type)) {
      if (!Array.isArray(element.points) || !element.points.length || !element.points.every(pair)
        || !Number.isFinite(element.x) || !Number.isFinite(element.y)) throw new Error(`Invalid points or coordinates on ${element.id}.`);
      for (const [axis, name] of [[0, 'width'], [1, 'height']]) {
        if (element[name] == null) {
          let min = Infinity;
          let max = -Infinity;
          for (const point of element.points) { min = Math.min(min, point[axis]); max = Math.max(max, point[axis]); }
          element[name] = max - min;
          fields.push(name);
        }
      }
    }
    if (element.type === 'arrow') {
      for (const side of ['start', 'end']) {
        const field = `${side}Binding`;
        const migrated = migrateBinding(element, element[field], side, elements);
        if (migrated !== element[field]) { element[field] = migrated; fields.push(field); }
      }
    }
    if (fields.length) changes.push({ elementId: element.id, fields });
  }
  return { scene, changes };
}

export async function prepareFile(source, output) {
  if (resolve(source) === resolve(output)) throw new Error('Output must be separate from the source file.');
  const bytes = await readFile(source);
  const { scene, changes } = prepareScene(JSON.parse(bytes));
  const prepared = `${JSON.stringify(scene, null, 2)}\n`;
  await writeFile(output, prepared, { flag: 'wx', mode: 0o600 });
  return { source: resolve(source), output: resolve(output), sourceSha256: hash(bytes), preparedSha256: hash(prepared), elementCount: scene.elements.filter(element => !element.isDeleted).length, changes };
}

async function main(args) {
  const usage = 'Prepare a local export for Plus (offline): node prepare-plus.mjs FILE.excalidraw --out PREPARED.excalidraw';
  if (args[0] === '--help') { console.log(usage); return; }
  if (args.length !== 3 || args[1] !== '--out') throw new Error(usage);
  console.log(JSON.stringify(await prepareFile(args[0], args[2]), null, 2));
}

if (process.argv[1] && await realpath(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
