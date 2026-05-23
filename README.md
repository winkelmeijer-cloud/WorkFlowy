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

Provide credentials via environment variables (a `.env` file is loaded
automatically for local runs — see `.env.example`):

```
WORKFLOWY_USERNAME=your@email.com
WORKFLOWY_PASSWORD=your-password
```

## Use with Claude Code / Claude Desktop

Add the server to your MCP client config, e.g. for Claude Desktop
(`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "workflowy": {
      "command": "node",
      "args": ["/absolute/path/to/workflowy-mcp/dist/index.js"],
      "env": {
        "WORKFLOWY_USERNAME": "your@email.com",
        "WORKFLOWY_PASSWORD": "your-password"
      }
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

- Your WorkFlowy password lives in the server's environment. Keep `.env` out of
  version control (it is git-ignored).
- The server has full read/write/delete access to your outline. `delete_node` is
  irreversible.
- This relies on an unofficial API; it may break if WorkFlowy changes internals.
