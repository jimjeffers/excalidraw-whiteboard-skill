---
name: ascii-riff
description: "Quickly sketch and iterate on ideas with ASCII diagrams directly in chat. Use for visual brainstorming, rough architectures, flows, and comparisons when an editable canvas or rendered graphic is unnecessary."
---

# ASCII Riff

Make the idea visible quickly, then refine it with the user. Draw directly in a fenced `text` block using ASCII characters: `[boxes]`, `-->`, `|`, `+`, and simple branches. No renderer, browser, canvas, or generated file is needed unless the user asks for one. Use tools only when the content requires evidence, such as inspecting code the user wants explained.

Start with the smallest useful sketch. Prefer one diagram that fits roughly 80 columns and one screen; split dense views by responsibility. Label components and important relationships, keep arrow direction unambiguous, and use whitespace instead of elaborate box borders. Match the structure to the question: architecture for dependencies, a flow for steps, a sequence for ordering, or adjacent alternatives for a comparison.

Use the user's terms. Distinguish proposals and assumptions from facts; inspect relevant source before claiming how existing code works. If a missing detail does not block a useful first sketch, state a brief assumption and proceed.

Keep surrounding prose to the key tradeoff or decision. When further discussion is useful, end with one focused question about the design. Do not turn a quick riff into a specification or add implementation detail merely to fill the diagram.

On follow-up, revise the affected sketch, preserving names and spatial arrangement where practical. Say what changed in a sentence. Show the updated whole when it remains small; use a clearly labeled detail view when it does not. Check alignment, arrow endpoints, and label readability before sending.
