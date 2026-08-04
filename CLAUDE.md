# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**workflowy-mcp** is a Model Context Protocol (MCP) server that exposes WorkFlowy outlines as tools accessible to Claude and other MCP clients. It authenticates with WorkFlowy using an unofficial community API client and lazy-loads the document tree on first use.

## Commands

```bash
npm install       # Install dependencies
npm run build     # Compile TypeScript to dist/
npm run dev       # Watch mode (recompile on save)
npm run typecheck # Type-check without emitting
npm start         # Run the compiled server
```

There is no test or lint infrastructure currently.

## Configuration

Set credentials via environment variables or a `.env` file:

```
WORKFLOWY_USERNAME=user@email.com
WORKFLOWY_PASSWORD=password
```

Accounts with two-factor authentication are not supported (library limitation of `karelklima/workflowy`).

## Architecture

The project has exactly two source files:

- **`src/workflowy.ts`** — WorkFlowy client singleton (`getClient()`), lazy document loading (`loadDocument()`), tree traversal (`walk`, `findById`), serialization (`serializeItem`), and search. All WorkFlowy API interaction is isolated here.

- **`src/index.ts`** — MCP server setup (StdioServerTransport), all 8 tool definitions with Zod-validated input schemas, a `run()` error-handling wrapper that converts exceptions to MCP error responses, and `ok()`/`fail()` helpers for formatting results.

## Adding a New Tool

1. In `src/index.ts`, add a new entry to the `server.setRequestHandler(ListToolsRequestSchema, ...)` tools array with `name`, `description`, and `inputSchema` (Zod schema).
2. Add a matching `case` in the `CallToolRequestSchema` handler, invoking `run()` with your implementation.
3. If the tool needs new WorkFlowy operations, add helper functions to `src/workflowy.ts` and export them.

## Key Patterns

- **Lazy loading**: `loadDocument()` fetches the full WorkFlowy tree only on first tool call; subsequent calls reuse the cached `document` variable. Mutations (create/edit/move/delete) update the live tree without re-fetching.
- **Error propagation**: Wrap all tool implementations in `run(async () => { ... })`. Any thrown error becomes a `{ isError: true, content: [...] }` response rather than crashing the server.
- **Serialization depth**: `serializeItem(item, depth)` recursively serializes children up to the specified depth. Use depth `0` for leaf-only, higher values for subtree traversal.
- **IDs**: WorkFlowy nodes use UUID-like strings as IDs. The string `"root"` is a sentinel used by `move_node` to indicate the top-level parent.
- **Logging**: Use `console.error()` for debug output — `console.log()` goes to stdout which is the MCP transport channel and will corrupt the protocol.
