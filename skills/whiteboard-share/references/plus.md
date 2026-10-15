# Import into Excalidraw Plus

Use the official `@excalidraw/cli@0.2.0` with Node.js 22+. The version is pinned because the Plus API is in public beta. This workflow creates one editable Plus scene from a local export. It does not expose the local server, establish live sync, or enable public link sharing.

## Authenticate and choose the collection

Check the existing login using the production API origin explicitly:

```sh
npx --yes @excalidraw/cli@0.2.0 whoami --api-url https://api.excalidraw.com
```

If credentials are missing, have the user run this in their own terminal and enter their Plus API key at the prompt:

```sh
npx --yes @excalidraw/cli@0.2.0 login --api-url https://api.excalidraw.com
```

Keys are available in Plus settings; see [authentication](https://plus.excalidraw.com/docs/api/authentication). The key needs access to create scenes, write scene content, and read content for verification. The CLI stores login credentials locally with owner-only permissions. An existing `EXCALIDRAW_API_KEY` also works and takes precedence over saved login. Do not ask the user to paste a key into chat, read credential files, or put a key in command arguments or receipts. `whoami` reports the workspace and key type without revealing the key. Set `EXCALIDRAW_NO_UPDATE_NOTIFIER=1` when running scripted commands to suppress unrelated update checks.

Use the workspace and collection the user requested:

- A personal key can use collection ID `private`. Use that for an upload to the user's own account when no shared collection was requested, after checking `whoami` identifies the intended workspace.
- A workspace key cannot access private collections. Discover existing collections with the command below, then resolve the intended destination before uploading. Do not substitute a shared collection for a requested private import or create a new collection implicitly.

```sh
npx --yes @excalidraw/cli@0.2.0 collections list --limit 100 \
  --api-url https://api.excalidraw.com
```

A shared collection follows its workspace permissions; an account upload is not necessarily private. If the authenticated workspace differs from the requested destination, stop and resolve that mismatch.

## Prepare and import

For a live board, use `whiteboard` with its explicit session ID to read the synced scene, inspect a fresh screenshot, and export a native `.excalidraw` file. Otherwise use the file the user identified. Inspect that exact revision before uploading. Keep images embedded in the export's `files` map; resolve missing image data rather than stripping images. Do not use `share.mjs inspect` for Plus: that helper deliberately rejects image boards and belongs to the snapshot workflow.

Choose a name and a fresh attempt directory under an ignored or private path. Replace `REVISION` with an unused identifier. If the directory already exists, inspect the earlier attempt instead of repeating creation.

```sh
umask 077
mkdir -p .local/shares
mkdir .local/shares/plus-REVISION
```

Prepare a separate copy before creating a remote scene. Resolve `PREPARE_PLUS_CLI` to this skill's `scripts/prepare-plus.mjs`:

```sh
node "$PREPARE_PLUS_CLI" /absolute/path/board.excalidraw \
  --out .local/shares/plus-REVISION/prepared.excalidraw
```

This offline helper supplies missing line/arrow dimensions and migrates the local runtime's centered, unrotated straight-arrow bindings. It preserves IDs, coordinates, labels, and embedded files, reports the changed fields and both hashes, and refuses to overwrite files. It passes current bindings through unchanged. Unsupported legacy geometry fails before upload; re-export that drawing with a current Excalidraw editor instead of guessing bindings. This is a compatibility preparation step, not a complete Plus schema validator. The official CLI alone does not migrate legacy elements, and the live API validates them more strictly than the CLI.

Record the original and prepared paths and SHA-256 values, workspace, collection ID, and intended name in the attempt directory before uploading. Keep both files unchanged during the import. Save output and errors so partial creation can be recovered. Run the following once, substituting the collection ID. The shell's noclobber option refuses to overwrite an earlier output file.

```sh
set -C
npx --yes @excalidraw/cli@0.2.0 scenes create \
  --name "Architecture" --collection-id private \
  --file .local/shares/plus-REVISION/prepared.excalidraw \
  --api-url https://api.excalidraw.com --retries 0 --output json \
  > .local/shares/plus-REVISION/create.json \
  2> .local/shares/plus-REVISION/create.stderr
```

The CLI checks the file's top-level structure before creating a scene, then sends its content for full server validation. These are two requests, not an atomic import. Read the exit status and both output files. On success, preserve `metadata.id` in the attempt record. Repeating `scenes create` creates another scene; never use it as a verification retry. Do not overwrite an earlier attempt record.

If creation succeeds but writing content fails, the CLI's error identifies the created scene ID. Inspect that scene before retrying content upload to the same ID. If creation itself has an uncertain outcome, look for the scene in the selected collection or report the uncertainty; do not blindly create another one. A missing account, expired key, or permission error is a setup issue, not a reason to switch destinations.

## Verify and deliver

Fetch metadata and content for the returned ID:

```sh
npx --yes @excalidraw/cli@0.2.0 scenes get SCENE_ID \
  --api-url https://api.excalidraw.com
npx --yes @excalidraw/cli@0.2.0 scenes content get SCENE_ID \
  --out .local/shares/plus-REVISION/download.excalidraw \
  --api-url https://api.excalidraw.com
```

Verify the destination and compare labels, connections, layout, background, and referenced image data against the prepared revision. Plus can regenerate element IDs on import. Match elements by unchanged geometry and content, record the ID mapping, and check that arrow bindings, text containers, and bound-element references follow that mapping. Do not treat changed IDs alone as missing content or assume array order proves a match. The service also normalizes editor state and metadata, so byte equality is not required. A nonempty `filesFailedToEmbed` is incomplete verification; report it instead of claiming all images survived.

Open the imported scene in [Excalidraw Plus](https://app.excalidraw.com/) when browser access is available and inspect the actual rendering. If the browser is not signed in, the official CLI can render the downloaded file with `render DOWNLOAD.excalidraw --out PREVIEW.png`; inspect it and distinguish this from checking the Plus UI. Return the verified scene URL from the browser or service. If a deep link is unavailable, return the scene name, ID, collection, and dashboard link rather than inventing a URL. Record verification status and any scene URL in the private attempt record. State when account or visual verification could not be completed.

Later edits in Plus and the local board are independent. Importing another revision creates a new scene by default. Updating an existing Plus scene requires the user to identify that target and request replacement; read and back it up first. `scenes content put` replaces the complete content and can remove cloud edits. Do not use it as automatic synchronization or modify sharing permissions as part of an ordinary import.

Source: [official CLI](https://github.com/excalidraw/cli) and [Plus API](https://plus.excalidraw.com/docs/api).
