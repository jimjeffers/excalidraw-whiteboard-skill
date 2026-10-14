# Development

The reusable skill lives in `skills/whiteboard/`. Edit that copy, then install it into the desired agent profile. The scripts use Node built-ins; the repository itself needs no `npm install`.

## Install from a checkout

Use this method to develop the skill or install without the Skills CLI. It requires Node 20+, npm, and Git.

```sh
git clone https://github.com/jimjeffers/excalidraw-whiteboard-skill.git
cd excalidraw-whiteboard-skill

# Install for either agent, or run both commands.
npm run install:skill          # Codex: ~/.codex/skills/whiteboard
npm run install:skill:claude   # Claude Code: ~/.claude/skills/whiteboard

npm run setup
```

These copies have different ownership and update behavior from a Skills CLI installation. Use the repository installers for local development copies and the Skills CLI for copies managed by that CLI. Avoid installing the same skill through both methods for the same agent.

## Distribution and discovery

The public repository is directly installable with the Skills CLI. Its `skills/whiteboard/SKILL.md` supplies the name and description; supporting scripts and references travel with the skill folder.

```sh
npx skills@1.7.2 add jimjeffers/excalidraw-whiteboard-skill --list
```

There is no separate npm package or skills.sh registry submission to publish. According to [Vercel's publishing guide](https://vercel.com/kb/guide/agent-skills-creating-installing-and-sharing-reusable-agent-context#5-publishing-and-discoverability-how-listing-actually-works), skills can appear on skills.sh through install telemetry. Direct installation works independently of directory indexing; do not promise immediate search visibility. The [CLI documentation](https://skills.sh/docs/cli) explains telemetry and its opt-out setting.

## Layout checks

```sh
npm run verify:layout
node skills/whiteboard/scripts/check-layout.mjs examples/background-jobs.excalidraw
node skills/whiteboard/scripts/check-layout.mjs examples/session-architecture.excalidraw
```

The tests exercise duplicate labels, card overlaps, horizontal and vertical spacing, unsupported geometry, invalid input, and the read-only CLI's exit codes. Inspect the rendered images too: stored text bounds can be estimates before browser sync.

## Integration checks

Install Google Chrome, then prepare the development runtime and its Playwright dependency:

```sh
npm run bootstrap
npm run verify:sessions
npm run verify
```

`bootstrap` builds a pinned checkout under `upstream/mcp_excalidraw/` and generates a machine-local `.codex/config.toml` for the original prototype. It does not start a server. This development bootstrap is separate from `npm run setup`, which installs the reusable skill's runtime outside the repository.

`verify:sessions` starts disposable boards to check distinct ports and scenes, explicit reopening, project scoping, unsafe-route rejection, concurrent reopen, persistence, snapshots, rendering, browser sync, local assets, and process ownership. `verify` exercises the original CLI and optional MCP adapter on a disposable canvas. Neither suite clears working boards. Evidence is written under ignored `output/` directories.

To check a separately installed runtime, set `WHITEBOARD_TEST_RUNTIME` to the `path` in its `runtime.json`. `WHITEBOARD_TEST_SCRIPT` can select an installed copy of `session.mjs`. The browser test still needs Playwright from the development checkout.

For a clean setup check without changing the normal runtime registry:

```sh
WHITEBOARD_HOME="$PWD/.local/fresh-install" npm run setup
```

Choose an unused directory for a genuinely fresh build. Setup fetches the exact commit recorded in `common.mjs`, applies the bundled patch, and uses `npm ci`. Repeating it with the same installed revision reuses that build. Run only one setup or installer at a time. Changing runtime assembly requires a new runtime bundle version as well as rerunning setup.

## Example boards

The PNGs in `examples/` are actual local Excalidraw renders, paired with native scene files. To explore one, create a new empty session, then import its absolute path:

```sh
node skills/whiteboard/scripts/session.mjs start --project "$PWD" --name "Example"
node skills/whiteboard/scripts/session.mjs run SESSION_ID import "$PWD/examples/background-jobs.excalidraw"
```

Use a fresh session for examples so you preserve ongoing work. After changes, export the native scene and PNG, run the layout checker, and inspect the image before committing. Keep private project boards and runtime data out of Git; `examples/` contains only the diagrams intended for public documentation.

## Original prototype

The initial experiment remains available for development and research:

```sh
node scripts/whiteboard.mjs start
node scripts/whiteboard.mjs status
node scripts/whiteboard.mjs stop
```

It uses fixed port **3210** and `.local/state/`, unlike the reusable session helper. The root `start`, `stop`, `status`, `board`, and `seed` npm commands target this prototype. Use `npm run session -- ...` or the installed skill for ordinary independent boards. Do not use the prototype wrapper to manage skill sessions.

The [original spec](spec.md) and [prototype verification notes](verification.md) record the initial design and MCP investigation.
