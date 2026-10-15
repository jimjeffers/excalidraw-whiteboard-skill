# Draft spec for local Codex whiteboard sessions

Jim and Codex use the same editable Excalidraw board to reason about systems, components, and service boundaries. Either can add a diagram, inspect the other's changes, and refine it during a design discussion. Conversation stays in Codex; the board holds the current visual model.

Start with one local canvas and take turns editing. Use the community Excalidraw canvas toolkit for the prototype, with its CLI as the immediate agent interface and MCP as an optional adapter. Keep exported boards in the project.

## First working session

1. Open the local board and sketch a system, or ask Codex to draw one.
2. After drawing, wait for the sync indicator or click **Sync to Backend**; tell Codex “read the board.”
3. Codex reads element IDs, labels, and connections, then inspects a rendered image to understand layout and freehand marks. Ambiguous sketches need discussion.
4. Discuss a change in chat. Codex saves a snapshot and updates the relevant elements while preserving the surrounding layout.
5. Inspect the result together and save an editable `.excalidraw` file in `boards/`. Later sessions can reopen it.

Example: “I added a queue between the API and worker. Read the board, explain how retries would work, and draw the failure path.”

## Prototype requirements

| Capability | First version |
| --- | --- |
| Create and inspect | Native Excalidraw shapes, text, arrows, images, and freehand drawing; agent access to scene JSON and rendered images |
| Update | Target individual element IDs; keep user layout unless a rearrangement is requested |
| Shared view | Browser and agent connect to the same loopback canvas service; browser edits sync after a short debounce |
| Persistence | Server checkpoints accepted edits to local disk; explicit portable exports live in `boards/` |
| Recovery | Named snapshots before substantial agent edits; restore or import a saved board |
| Discussion | User prompts Codex after editing; no automatic chat wakeup or background agent watching |

The original prototype uses a single active board at port 3210. The reusable `whiteboard` skill adds a CLI registry of named boards with stable IDs, project directories, separate ports, and durable data. A chat explicitly opens a saved session or starts a new one. A graphical board catalog remains a later feature.

## Architecture and MCP decision

The browser runs the open-source `@excalidraw/excalidraw` editor. A local Node service owns the scene and broadcasts updates over WebSocket. Codex invokes the toolkit CLI, which calls the service's REST API. An optional stdio MCP process exposes the same operations. Disk checkpoints recover the running scene; exported files are deliberate project artifacts.

**We do not need the official Excalidraw MCP for this workflow.** The official server provides a diagram widget through MCP Apps, plus checkpoint editing. Its model-facing tools are `read_me` and `create_view`; checkpoint read/save and cloud export are app-facing tools. It does not supply the local board catalog or standalone shared canvas API we need. This is a conclusion from the [official server source](https://github.com/excalidraw/excalidraw-mcp/blob/157aa23ceb1976008aadc89eb05e3444060f09d6/src/server.ts), rather than a claim that it cannot support iterative diagrams.

The [community toolkit](https://github.com/yctimlin/mcp_excalidraw/tree/8084a1c8b410d625fcfd59d5cffb32f3a86a2a6f) already supplies the local canvas, CLI, MCP adapter, and durable storage. It embeds the official editor but is not an Excalidraw-maintained project. The bootstrap pins that revision and applies a recorded dependency-lock patch. We can replace the adapter later without abandoning the `.excalidraw` format.

The [official Excalidraw development guide](https://github.com/excalidraw/excalidraw/blob/master/dev-docs/docs/introduction/development.mdx) distinguishes the self-hosted client from sharing and collaboration infrastructure. Running that client alone would not give Codex a scene-editing service.

## Acceptance checks

- An agent-created element appears in the browser without reload.
- A label typed in the browser becomes readable through the agent interface; an agent edit of that label appears in the browser.
- The saved scene survives a canvas service restart.
- A portable export can be reimported with element IDs and text preserved, and rendered to an image.
- MCP discovery and a real tool call work against the same service.

`npm run verify` exercises these on a disposable canvas. See `verification.md` for the latest observed result.

## Optional online uploads

`whiteboard-share` is a separate companion skill for an explicit request to publish a saved revision to Excalidraw.com. It accepts a native export, inspects it offline, encrypts before upload, and returns a snapshot link with a local receipt. It does not alter the local session or connect the board to a cloud collaboration room. The first version handles diagrams without image assets; it directs image boards to the browser sharing workflow. Ordinary whiteboard work remains local.

For account storage, the same companion routes explicit Excalidraw Plus requests to the pinned official CLI. A Plus API key identifies the workspace; personal keys can import into the owner's private collection, while workspace keys require a shared collection. The workflow creates a new editable scene from a native export, including embedded images, then reads back and verifies it. Partial creation is recovered using the returned scene ID. It does not enable public sharing, replace existing scenes implicitly, or synchronize later local and cloud edits.

## Limits and next decisions

The upstream browser can send a full scene replacement. Concurrent edits can overwrite one another; this prototype relies on turn-taking. Browser undo is not a substitute for a saved snapshot of agent changes. There is no automatic association between a Codex chat and a board.

The local server has no authentication and permissive cross-origin handling. Keep it on loopback; review origin checks and authentication before expanding access. Compatible dependency fixes are pinned, but the frontend dependency tree still has audit findings. This is a local experiment, not a production deployment.

The session helper now supports several named boards per project and checks the launched server's identity before routing commands or stopping it. Next, add revision checks that reject stale scene writes. Selection-aware prompts (“explain these boxes”) would make the discussion more precise. Cloud hosting, remote multi-user sessions, and automatic monitoring are outside the first version.
