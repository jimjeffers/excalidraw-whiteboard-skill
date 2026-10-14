# Third-party notices

## Community canvas runtime

Setup downloads [yctimlin/mcp_excalidraw](https://github.com/yctimlin/mcp_excalidraw) at commit `8084a1c8b410d625fcfd59d5cffb32f3a86a2a6f`. This community project supplies the canvas service, CLI, rendering, and optional MCP adapter. It is licensed under MIT, copyright (c) 2024 MCP Excalidraw Server. Setup copies its `LICENSE` into the installed runtime.

The repository includes a dependency-lock patch against that source and a copy of its [MIT license](licenses/mcp-excalidraw-LICENSE). The downloaded source, dependencies, and compiled runtime are not committed here. Dependency packages retain their own licenses.

## Excalidraw

The community runtime embeds the official [`@excalidraw/excalidraw`](https://github.com/excalidraw/excalidraw) editor, distributed under the MIT license. Packaged fonts are copied from that dependency for local serving; their upstream licenses still apply.

This skill is an independent integration, not an official Excalidraw, OpenAI, or Anthropic project. Product names identify the software it works with.
