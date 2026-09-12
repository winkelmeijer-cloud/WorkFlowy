# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**workflowy-mcp** is a Model Context Protocol (MCP) server that exposes WorkFlowy outlines as tools accessible to Claude and other MCP clients. It authenticates with WorkFlowy using an unofficial community API client and downloads the full document tree on every tool call.

## Commands

```bash
npm install       # Install dependencies
npm run build     # Compile TypeScript to dist/
npm run dev       # Watch mode (recompile on save)
npm run typecheck # Type-check without emitting
npm test          # Build, then run test/*.test.mjs against dist/ with node --test
npm start         # Run the compiled server
```

Tests live in `test/*.test.mjs` and run with `npm test` (node's built-in runner, against the compiled `dist/`). They cover the pure functions in `src/workflowy.ts` with hand-built stand-ins for the library's List objects; nothing talks to WorkFlowy. There is no lint.

## Configuration

Credentials are read in `src/workflowy.ts` from
`C:\Users\winke\Documents\PrivateConfig\workflowy.env` (override the path with
`WORKFLOWY_ENV`), parsed as `KEY=value` the same way `notify`, `mail-fetch` and
`sheets-write` parse theirs:

```
WORKFLOWY_USERNAME=user@email.com
WORKFLOWY_PASSWORD=password
```

An explicit `WORKFLOWY_USERNAME` / `WORKFLOWY_PASSWORD` in the process
environment still wins over the file.

⚠️ **Do not reintroduce an `env` block in an MCP client config.** Until
2026-09-04 the credential sat in cleartext in `~/.claude/.mcp.json`, readable by
every process running as this user. Secrets live in PrivateConfig and nowhere
else — the estate rule in `C:\dev\CLAUDE.md`.

Accounts with two-factor authentication are not supported (library limitation of `karelklima/workflowy`).

## Architecture

The project has exactly two source files:

- **`src/workflowy.ts`** — WorkFlowy client singleton (`getClient()`), document loading (`loadDocument()`, a fresh fetch each time), tree traversal (`walk`, `findById`), serialization (`serialize`), ancestor paths (`pathOf`), and search. All WorkFlowy API interaction is isolated here.

- **`src/index.ts`** — MCP server setup (StdioServerTransport), all 8 tool definitions with Zod-validated input schemas, a `run()` error-handling wrapper that converts exceptions to MCP error responses, and `ok()`/`fail()` helpers for formatting results.

## Adding a New Tool

1. In `src/index.ts`, add a `server.tool(name, description, zodShape, handler)` call next to the existing eight. The handler wraps its body in `run(async () => { ... })` and returns `ok(data)` or `fail(message)`.
2. Load the document with `await loadDocument()` inside the handler (never at module level) and, for a mutation, finish with `await doc.save()`.
3. If the tool needs new WorkFlowy operations, add helper functions to `src/workflowy.ts` and export them.

## Key Patterns

- **Fresh fetch per call**: `loadDocument()` downloads the whole tree every time it is called (about 2.6 s for ~19k nodes as of 2026-09-11). Only the client object is cached, not the document. Mutations edit the freshly loaded tree and persist with `doc.save()`; there is no cache to invalidate and no cross-call state.
- **Error propagation**: Wrap all tool implementations in `run(async () => { ... })`. Any thrown error becomes a `{ isError: true, content: [...] }` response rather than crashing the server.
- **Serialization depth**: `serialize(item, depth)` recursively serializes children up to the specified depth. Use depth `0` for leaf-only, higher values for subtree traversal. It always emits `id`, `name`, `isCompleted`, `childCount`, plus `createdAt`/`lastModifiedAt` when the library has them; `note`, `completedAt`, `hasFile`, `isMirror` and `shared` (`{viaEmail, viaUrl, url}`) appear only when set, to keep payloads small. The library's `priority` is sibling position, not a priority, and is deliberately not exposed.
- **Paths**: `pathOf(item, root)` returns the ancestor names from the top level down to the parent, HTML tags stripped, joined with ` > `; a top-level item has `""`. `search_nodes` puts it on every hit and `get_node` on the result, because the outline has many identically named nodes (nine called `Alden` as of 2026-09-12).
- **IDs**: WorkFlowy nodes use UUID-like strings as IDs. The string `"root"` is a sentinel used by `move_node` to indicate the top-level parent.
- **Logging**: Use `console.error()` for debug output — `console.log()` goes to stdout which is the MCP transport channel and will corrupt the protocol.
