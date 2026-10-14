import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { root, url, environment } from './runtime.mjs';

function cli(args, input) {
  const result = spawnSync(process.execPath, [join(root, 'scripts/whiteboard.mjs'), ...args], {
    cwd: root, env: environment(), input, encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout;
}
cli(['start']);
const scene = await fetch(`${url}/api/elements`).then(r => r.json());
if (scene.elements.length) {
  console.log('Canvas already has elements; leaving it unchanged.');
  process.exit(0);
}
const elements = [];
const text = (id, x, y, value, fontSize = 20) => elements.push({ id, type: 'text', x, y, text: value, fontSize, fontFamily: 'helvetica', strokeColor: '#334155' });
const box = (id, x, y, label, color) => elements.push({ id, type: 'rectangle', x, y, width: 250, height: 100, text: label, fontSize: 22, fontFamily: 'helvetica', fillStyle: 'solid', backgroundColor: color, strokeColor: '#334155', roundness: { type: 3 } });
const arrow = (id, from, to, label) => elements.push({ id, type: 'arrow', x: 0, y: 0, startElementId: from, endElementId: to, text: label, fontSize: 16, fontFamily: 'helvetica', strokeColor: '#64748b' });
text('title', 80, 35, 'A shared whiteboard for you + Codex', 34);
text('subtitle', 80, 90, 'Draw here. Discuss in Codex. Refine the same scene.', 22);
box('human', 80, 200, 'You\nExcalidraw canvas', '#dbeafe');
box('service', 500, 200, 'Local canvas service\n127.0.0.1:3210', '#d1fae5');
box('codex', 920, 200, 'Codex\nCLI / optional MCP', '#ede9fe');
arrow('human-service', 'human', 'service', 'edits + live sync');
arrow('codex-service', 'codex', 'service', 'read + update');
box('durable', 500, 450, 'Local disk\nautosaved state', '#fef3c7');
box('exports', 920, 450, 'Project boards\n.excalidraw files', '#fce7f3');
arrow('persist', 'service', 'durable', 'save on change');
arrow('export', 'codex', 'exports', 'export / import');
text('workflow', 80, 620, 'Try it: add a component, wait for sync, then tell Codex “read the board”.', 22);
text('turn-taking', 80, 665, 'Prototype: take turns editing. Named boards and conflict handling come next.', 18);
cli(['add', '-'], JSON.stringify(elements));
cli(['snapshot', 'save', 'initial-architecture']);
cli(['export', '--out', 'boards/local-whiteboard.excalidraw']);
cli(['screenshot', '--out', 'boards/local-whiteboard.png']);
console.log('Created the starter board and saved an editable export.');
