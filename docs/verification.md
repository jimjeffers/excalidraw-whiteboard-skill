# Verification

Verified on October 14, 2026, on macOS with Node 24.14.0 and installed Google Chrome. Tests use disposable canvases and leave working boards intact.

## Reusable skill

A clean `setup.mjs` run in a new `WHITEBOARD_HOME` fetched pinned commit `8084a1c8b410d625fcfd59d5cffb32f3a86a2a6f`, applied the bundled dependency patch, built the frontend and server, and installed the runtime. The session integration suite then exercised that fresh build.

| Check | Observed result |
| --- | --- |
| Session isolation | Same-name boards had distinct IDs, ports, and scenes |
| Reopening | An explicit ID reused its running process; project filtering returned only matching boards |
| Routing | URL overrides and invalid session IDs were rejected |
| Persistence | Scene content and snapshots survived stopping and reopening |
| Concurrent reopen | Two open requests started only one process for the same board |
| Export and render | Native scene export and PNG rendering succeeded |
| Browser sync | Agent-created content appeared in Chrome; browser-entered text reached only the selected board |
| Local assets | The tested drawing flow requested no external assets while nonlocal requests were blocked |
| Ownership | Redirected metadata could not edit or stop a different board's server |

`npm run verify:sessions` runs these checks. `WHITEBOARD_TEST_RUNTIME` selected the fresh installed runtime for this verification. Temporary test servers were stopped afterward.

The ten layout-checker tests passed, covering duplicate connector labels, overlap, clearance, unsupported paths, invalid scenes, and read-only behavior. The public example exports passed the checker and were visually inspected. The architecture and collaborative-iteration boards were also inspected in the live browser.

The skill metadata validator passed. The global Codex and Claude Code installations matched `skills/whiteboard/` byte-for-byte. Discovery in a new chat in either app has not been independently tested.

## Original prototype

`npm run verify` passed all eight checks again on October 14, 2026, on a disposable canvas: agent-to-browser updates, browser-to-agent updates, round-trip editing, local assets, optional MCP tool discovery and calls, export/render, persistence after restart, and reimport with IDs preserved.

Evidence is written to ignored `output/playwright/` and `output/whiteboard/` directories. See [development](development.md) to rerun the suites.

## Boundaries

These checks establish the turn-taking text/shape workflow. They do not establish safe simultaneous editing, image-heavy board fidelity, freehand semantic interpretation, or recovery after every possible system failure. There is no graphical board catalog, automatic chat wakeup, or automatic change feed.

The community server has no authentication or conflict detection. Keep it bound to loopback. Optional library browsing and upstream sharing features can contact external services; the tested drawing flow did not. The skill's command allowlist excludes cloud sharing and does not require MCP configuration.

The patched clean build reported 16 audit findings across the frontend/build dependency tree (1 low, 9 moderate, 6 high). The separate production dependency install reported zero. Some development dependencies are bundled into the frontend, so the production-only audit does not establish that the whole application is free of known issues. No forced major-version updates were applied.
