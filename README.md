# workflowy-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server that exposes your
[WorkFlowy](https://workflowy.com) outline as a set of tools, so Claude (or any MCP
client) can read, search, and edit your lists.

It is built on the community [`karelklima/workflowy`](https://github.com/karelklima/workflowy)
client, which talks to WorkFlowy's internal API and authenticates with your
**username and password**. Accounts protected by 2FA / one-time codes are not
supported by that library.

## Tools

| Tool | Description |
| --- | --- |
| `list_top_level` | List the top-level items of the outline (a starting point for discovering ids). |
| `search_nodes` | Case-insensitive substring search across all item names and notes. |
| `get_node` | Fetch one node by id, including descendants up to a depth. |
| `create_node` | Create a new item, optionally under a given parent. |
| `edit_node` | Change an item's name and/or note. |
| `set_completed` | Complete or uncomplete an item (checkbox). |
| `move_node` | Move an item to a different parent (or `root`). |
| `delete_node` | Delete an item and its descendants (irreversible). |

## Setup

```bash
npm install
npm run build
```

Credentials come from `C:\Users\winke\Documents\PrivateConfig\workflowy.env`
on this machine, in the same `KEY=value` shape the other local tools use:

```
WORKFLOWY_USERNAME=your@email.com
WORKFLOWY_PASSWORD=your-password
```

Override the location with `WORKFLOWY_ENV`. Setting `WORKFLOWY_USERNAME` /
`WORKFLOWY_PASSWORD` directly in the environment still works and takes
precedence, which is handy for a one-off run.

**Never put the credentials in your MCP client's config file** — see Security
notes.

## Use with Claude Code / Claude Desktop

Add the server to your MCP client config, e.g. for Claude Desktop
(`claude_desktop_config.json`). Note there is no `env` block — the server reads
the credential itself:

```json
{
  "mcpServers": {
    "workflowy": {
      "command": "node",
      "args": ["/absolute/path/to/workflowy-mcp/dist/index.js"]
    }
  }
}
```

Or with Claude Code:

```bash
claude mcp add workflowy -- node /absolute/path/to/workflowy-mcp/dist/index.js
```

## Development

```bash
npm run dev        # tsc --watch
npm run typecheck  # type-check without emitting
```

## Security notes

- **The password never goes in the MCP client config.** An `env` block there sits
  in cleartext in a file every process running as you can read — including every
  agent session, and anything a prompt injection talks one into running. This
  server reads PrivateConfig instead. That is how it was configured until
  2026-09-04, and moving it out is why the setup section reads as it does.
- The credential file lives outside every repository, so there is no secret in
  this tree for `.gitignore` to have to catch.
- The server has full read/write/delete access to your outline. `delete_node` is
  irreversible.
- This relies on an unofficial API; it may break if WorkFlowy changes internals.
