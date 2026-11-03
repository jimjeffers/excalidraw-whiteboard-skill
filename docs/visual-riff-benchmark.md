# ASCII riff versus whiteboard

On November 2, 2026, one fresh execution of each skill completed the same upload-processing design request. ASCII finished in **13.7 seconds**; whiteboard finished in **68.7 seconds**. In this pair, ASCII used **87.2% fewer reported input + output tokens** and completed **5.0 times faster**.

The new [ascii-riff skill](../skills/ascii-riff/SKILL.md) is installed locally for Codex and Claude Code. It produces a compact ASCII sketch directly in chat, with brief design commentary and targeted revisions on follow-up. The whiteboard skill remains useful when a shared, editable canvas is the desired output.

## Visual comparison

![Side-by-side outputs for the same upload-processing request: ASCII riff completed in 13.7 seconds with 43,321 input plus output tokens; whiteboard completed in 68.7 seconds with 338,587 tokens. Both show the upload, queue, worker, storage, and retry relationships.](assets/ascii-riff/comparison-minimal.png)

These screenshots capture a documentation view of the saved ASCII response and the original whiteboard export, not the original chat UI. The diagram content is unchanged; headings and measured results were added for comparison. Creating these screenshots is excluded from the benchmark timings.

Open the individual captures for larger text: [ASCII output](assets/ascii-riff/ascii-output-minimal.png) · [Whiteboard output](assets/ascii-riff/whiteboard-output-minimal.png). The [HTML capture source](assets/ascii-riff/comparison.html) is self-contained apart from its adjacent whiteboard PNG; open it locally to inspect or recapture at a different size. The combined screenshot uses an 1840-pixel-wide viewport.

## Measured results

| Measurement | ascii-riff | whiteboard |
| --- | ---: | ---: |
| Time to completed response | 13.717 s | 68.674 s |
| Full CLI process, including shutdown | 17.111 s | 70.342 s |
| Input tokens | 42,950 | 334,970 |
| Cached input tokens (part of input) | 34,304 | 306,048 |
| Uncached input tokens (input minus cached) | 8,646 | 28,922 |
| Output tokens | 371 | 3,617 |
| Reported reasoning output counter | 153 | 673 |
| Input + output tokens | 43,321 | 338,587 |

These are CLI usage counters, not estimates from text length. Cached input is not added a second time. The input + output calculation uses those two named counters without adding the separately reported reasoning counter. Tokens include the agent's context and repeated model/tool interactions, not just the diagram. This is not a dollar-cost comparison or a measure of account quota consumption.

## Method

- The measured whiteboard source was at repository commit `1afb2a2`, alongside the new ASCII skill. Later whiteboard runtime changes are not measured by this trial.
- Codex CLI `0.166.0-alpha.5.1`, inheriting the same local configuration: `gpt-6-astra`, high reasoning effort, priority service tier. Neither execution overrides the model, effort, or tier.
- Two fresh, ephemeral `codex exec --json` executions, sequentially: ASCII first, whiteboard second. Both used the same repository, available tooling, and shared instructions. Only the skill name/path and response output path differed.
- Elapsed time starts immediately before spawning the CLI and ends when its `turn.completed` event arrives. Process shutdown is reported separately. Skill creation, installation, benchmark preparation, and the parent chat's final review are excluded.
- Usage comes directly from each `turn.completed.usage` event, using the [documented Codex JSON event interface](https://learn.chatgpt.com/docs/non-interactive-mode).
- The whiteboard runtime was already installed. Its measurement includes a new session, initial inspection and snapshot, drawing, export, rendering, layout checking, and a correction to the retry label. Existing boards were not edited.
- Browser opening failed because local browser use was disabled. The skill continued with local image inspection and a live board link. This failed attempt and its tool response are included in the measurement; live browser synchronization was not verified.

One run per workflow demonstrates the behavior of this specific request and environment. It does not establish an average or isolate the diagram format from skill length, tool overhead, cache effects, or model variability. The whiteboard also delivers a richer artifact: a persistent editable canvas and portable export.

## Exact design request

> Let's quickly riff on a proposed upload-processing system. Show Browser, Upload API, Object Storage, Job Queue, and Worker. The API stores the upload and queues a job; the worker reads the file and writes a result to Object Storage. Show how a transient processing failure retries, and flag one important design tradeoff. Keep the first sketch small enough to discuss in one glance. This is a hypothetical design, not an explanation of this repository. Make reasonable assumptions and complete the first iteration without asking for input.

Each request began with `Use $SKILL at ABSOLUTE_SKILL_PATH.` and ended with the following shared instructions:

> Read and use the specified skill. Follow its normal workflow. Do not modify application code, skills, configuration, or existing boards. Do not delegate or run other agents. No web research is needed. Any board must be a new isolated session in this project, with its ID explicit; no human is editing that new board. Put any board exports in boards/visual-skill-benchmark/. Leave the new board available for the user. Your final response should contain the sketch or links to the rendered and editable sketch, plus the key tradeoff. Do not mention benchmark performance.

## Outputs and verification

Both outputs contain the five requested components, storage and queue relationships, transient-failure retries, and the duplicate-processing/idempotency tradeoff. The ASCII sketch was read directly; the whiteboard's final PNG was visually inspected and its scene read back. The exported board passed `check-layout.mjs` with no findings after the measured run corrected the retry label placement.

The ASCII response:

```text
[Browser] --upload--> [Upload API] --1. store file--> [Object Storage]
                          |                             |     ^
                     2. enqueue                         |     |
                     job + file key              read file   write result
                          |                             |     |
                          v                             v     |
                     [Job Queue] --deliver job------> [Worker]
                          ^                             |
                          +-- transient failure: -------+
                              retry with backoff
                              (limited attempts)
```

The response assumes asynchronous processing with at-least-once delivery, and recommends a stable job ID and idempotent result writes to handle repeated attempts.

Whiteboard artifacts preserved in the repository:

- [Original PNG preview](assets/ascii-riff/whiteboard-canvas.png)
- [Editable scene](assets/ascii-riff/upload-processing.excalidraw)
- [Live board](http://127.0.0.1:52135), session `4381904e-a8c4-48ee-80a8-9617a9abca37`. The port may change after reopening.

Local measurement evidence is retained under `.local/visual-skill-benchmark/`: `results.json`, `run.mjs`, and per-skill `prompt.txt`, `events.jsonl`, `stderr.log`, and `response.md`. These logs and the original `boards/` exports are ignored by Git. The documentation copies under `docs/assets/ascii-riff/` are included in the repository, alongside the exact usage values and design request in this report.

The new skill passed the bundled skill validator, and installed Codex and Claude Code copies matched the source. No application runtime changes were needed.
