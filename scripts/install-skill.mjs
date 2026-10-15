import { cpSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
let claude = false;
let skill = 'whiteboard';
while (args.length) {
  const arg = args.shift();
  if (arg === '--claude' && !claude) claude = true;
  else if (arg === '--skill' && args.length) skill = args.shift();
  else throw new Error('Usage: node scripts/install-skill.mjs [--claude] [--skill whiteboard|whiteboard-share]');
}
if (!['whiteboard', 'whiteboard-share'].includes(skill)) throw new Error('Unknown skill.');
const source = join(project, 'skills', skill);
const profileDir = claude
  ? join(homedir(), '.claude')
  : resolve(process.env.CODEX_HOME || join(homedir(), '.codex'));
const skillsDir = join(profileDir, 'skills');
const target = join(skillsDir, skill);
const backupsDir = join(profileDir, 'skill-backups');

// Stage the whole directory so removed source files also disappear on update.
mkdirSync(skillsDir, { recursive: true });
const staging = mkdtempSync(join(profileDir, `.${skill}-install-`));
const stagedSkill = join(staging, skill);
let backup;
try {
  cpSync(source, stagedSkill, { recursive: true, errorOnExist: true, force: false });
  if (existsSync(target)) {
    mkdirSync(backupsDir, { recursive: true });
    const backupDir = mkdtempSync(join(backupsDir, `${skill}-`));
    backup = join(backupDir, skill);
    renameSync(target, backup);
  }
  try {
    renameSync(stagedSkill, target);
  } catch (error) {
    if (backup) renameSync(backup, target);
    throw error;
  }
  console.log(`Installed: ${target}`);
  if (backup) console.log(`Previous version: ${backup}`);
  console.log(`Editable source: ${source}`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
