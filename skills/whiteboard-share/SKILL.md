---
name: whiteboard-share
description: "Upload a local Excalidraw whiteboard as an Excalidraw.com snapshot link or import it into an Excalidraw Plus account. Use for explicit online sharing or account uploads, not ordinary local drawing or file exports."
license: MIT
metadata:
  author: Jim Jeffers
  version: "0.3.2"
  compatibility: "Snapshot links require Node.js 20+ and network access, without an account. Plus imports use the pinned official CLI with Node.js 22+ and a Plus API key. Both accept a local .excalidraw export; no MCP server is required."
---

# Whiteboard Share

Upload one saved revision to the destination the user requests. Creating a diagram, exporting a file, installing this skill, or mentioning collaboration does not authorize an upload. If the user already requested upload of an identified board, proceed without asking for the same permission again. If “share” could mean a local session, snapshot link, or account import, clarify the destination first.

## Choose the destination

- **Excalidraw.com snapshot link:** follow the steps below. No account is required.
- **Excalidraw Plus account:** follow [Plus imports](references/plus.md). This creates an editable scene in the selected account collection through the official CLI, including embedded image assets. It requires authentication and is not a public snapshot link.

Do not fall back from a failed Plus import to a public snapshot upload. Neither destination establishes ongoing synchronization with the local board.

## Excalidraw.com snapshots

The result is an immutable snapshot, with no ongoing connection to the local board. Later changes require a new upload. No Excalidraw account is needed. Anyone with the complete link can open the drawing; its fragment contains the decryption key. Keep links and receipts out of Git and public logs unless the user asks to publish them. This helper does not offer revocation or promise a retention period.

## Select and inspect

Use the `.excalidraw` file or session the user identifies. For a live board, use the installed `whiteboard` skill to resolve the explicit session ID, read the current scene, inspect a fresh screenshot, and export a new native file after the user's edits have synced. Preserve the board; upload does not require editing it or exposing its server. If the local skill is unavailable, accept an existing native export instead.

Resolve `scripts/share.mjs` relative to this skill's location. `SHARE_CLI` below stands for its absolute path.

```sh
node "$SHARE_CLI" inspect /absolute/path/board.excalidraw
```

Inspection is offline. It returns the source file's SHA-256 and the number of live elements. Deleted elements, editor selection state, and unreferenced files are excluded; labels, connections, IDs, layout, and background are preserved. Keep content review proportional to the request; if the scene contains unexpected material outside the requested board, resolve that before publishing.

The snapshot helper supports diagrams without image elements, up to 5 MiB of input JSON. It refuses image boards because Excalidraw stores shared images separately. For those boards, import the file into Excalidraw.com in a separate browser tab and use its Share / Export link workflow within the user's existing upload authorization. Preserve any preexisting browser drawing. Do not strip images to make the upload succeed. This helper does not target Plus or custom services; Plus uses its separate workflow above.

## Upload and verify

Choose a new receipt path in an ignored or private directory, such as `.local/shares/board-REVISION.json`. Create its parent directory first. Use the exact hash returned by inspection:

```sh
node "$SHARE_CLI" upload /absolute/path/board.excalidraw \
  --sha256 HASH_FROM_INSPECT \
  --receipt /absolute/path/.local/shares/board-REVISION.json
```

Only `upload` makes a network request. The helper compresses and encrypts the scene locally, posts to `https://json.excalidraw.com/api/v2/post/`, saves the link with owner-only file permissions, and downloads the ciphertext to verify it matches. It does not alter the source file or local session. The hash prevents uploading a file that changed after inspection.

Read the returned status. `verified` means the saved payload was retrieved intact; open the returned link and inspect the rendered diagram when browser access is available. If visual verification is unavailable, say so rather than claiming it rendered correctly. Return the link and identify it as a snapshot.

Reusing a successful receipt returns the existing link. An `uploaded` result with a verification error retains the link; repeat the same command to retry only the download. A `pending` or `uncertain` receipt blocks another POST. Inspect it and report the uncertainty; don't bypass it by choosing a new receipt unless the user deliberately requests another upload. If saving the receipt fails after upload, preserve the URL from the command output.

The helper implements the [Excalidraw sharing format](https://github.com/excalidraw/excalidraw/blob/master/excalidraw-app/data/index.ts). This is a public application endpoint, not a versioned integration guarantee. A service error should produce a clear failure, not a fallback upload to another host.
