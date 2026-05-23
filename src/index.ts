#!/usr/bin/env node
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { findById, loadDocument, search, serialize } from "./workflowy.js";

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function fail(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

// Run a handler that touches WorkFlowy, converting thrown errors into a
// tool error result rather than crashing the server.
async function run(handler: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await handler();
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

const server = new McpServer({
  name: "workflowy-mcp",
  version: "0.1.0",
});

server.tool(
  "list_top_level",
  "List the top-level items of the WorkFlowy outline. Use this as a starting point to discover node ids before drilling in with get_node.",
  {
    depth: z
      .number()
      .int()
      .min(0)
      .max(5)
      .default(1)
      .describe("How many levels of children to include (0 = names only)."),
  },
  ({ depth }) =>
    run(async () => {
      const doc = await loadDocument();
      return ok(doc.root.items.map((item) => serialize(item, depth)));
    }),
);

server.tool(
  "search_nodes",
  "Search the entire outline for items whose name or note contains the query (case-insensitive substring match). Returns matching node ids.",
  {
    query: z.string().min(1).describe("Text to search for in item names and notes."),
    limit: z.number().int().min(1).max(200).default(25).describe("Maximum number of matches to return."),
  },
  ({ query, limit }) =>
    run(async () => {
      const doc = await loadDocument();
      return ok(search(doc, query, limit));
    }),
);

server.tool(
  "get_node",
  "Get a single node by id, including its descendants up to the requested depth.",
  {
    id: z.string().min(1).describe("The id of the node to fetch."),
    depth: z.number().int().min(0).max(10).default(2).describe("How many levels of children to include."),
  },
  ({ id, depth }) =>
    run(async () => {
      const doc = await loadDocument();
      const item = findById(doc, id);
      if (!item) return fail(`No node found with id "${id}".`);
      return ok(serialize(item, depth));
    }),
);

server.tool(
  "create_node",
  "Create a new item. If parentId is omitted, the item is created at the top level of the outline.",
  {
    name: z.string().describe("The name (main text) of the new item."),
    note: z.string().optional().describe("Optional note/body text for the item."),
    parentId: z
      .string()
      .optional()
      .describe("Id of the parent node to create this item under. Omit to create at the top level."),
  },
  ({ name, note, parentId }) =>
    run(async () => {
      const doc = await loadDocument();
      const parent = parentId ? findById(doc, parentId) : doc.root;
      if (!parent) return fail(`No parent node found with id "${parentId}".`);

      const created = parent.createItem();
      created.setName(name);
      if (note !== undefined) created.setNote(note);
      await doc.save();

      return ok({ created: serialize(created), parentId: parentId ?? null });
    }),
);

server.tool(
  "edit_node",
  "Edit an existing item's name and/or note. At least one of name or note must be provided.",
  {
    id: z.string().min(1).describe("The id of the node to edit."),
    name: z.string().optional().describe("New name for the item."),
    note: z.string().optional().describe("New note/body text for the item."),
  },
  ({ id, name, note }) =>
    run(async () => {
      if (name === undefined && note === undefined) {
        return fail("Provide at least one of name or note to edit.");
      }
      const doc = await loadDocument();
      const item = findById(doc, id);
      if (!item) return fail(`No node found with id "${id}".`);

      if (name !== undefined) item.setName(name);
      if (note !== undefined) item.setNote(note);
      await doc.save();

      return ok(serialize(item));
    }),
);

server.tool(
  "set_completed",
  "Mark an item as completed or uncompleted (the checkbox state).",
  {
    id: z.string().min(1).describe("The id of the node to update."),
    completed: z.boolean().default(true).describe("true to complete the item, false to uncomplete it."),
  },
  ({ id, completed }) =>
    run(async () => {
      const doc = await loadDocument();
      const item = findById(doc, id);
      if (!item) return fail(`No node found with id "${id}".`);

      item.setCompleted(completed);
      await doc.save();

      return ok(serialize(item));
    }),
);

server.tool(
  "move_node",
  'Move an item to a different parent. Use "root" as targetParentId to move it to the top level.',
  {
    id: z.string().min(1).describe("The id of the node to move."),
    targetParentId: z.string().min(1).describe('Id of the new parent, or "root" for the top level.'),
  },
  ({ id, targetParentId }) =>
    run(async () => {
      const doc = await loadDocument();
      const item = findById(doc, id);
      if (!item) return fail(`No node found with id "${id}".`);

      const target = targetParentId === "root" ? doc.root : findById(doc, targetParentId);
      if (!target) return fail(`No target parent found with id "${targetParentId}".`);

      item.move(target);
      await doc.save();

      return ok({ moved: serialize(item), targetParentId });
    }),
);

server.tool(
  "delete_node",
  "Delete an item and all of its descendants. This is irreversible.",
  {
    id: z.string().min(1).describe("The id of the node to delete."),
  },
  ({ id }) =>
    run(async () => {
      const doc = await loadDocument();
      const item = findById(doc, id);
      if (!item) return fail(`No node found with id "${id}".`);

      const snapshot = serialize(item);
      item.delete();
      await doc.save();

      return ok({ deleted: snapshot });
    }),
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr is safe; stdout is reserved for the MCP protocol stream.
  console.error("workflowy-mcp server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error starting workflowy-mcp:", error);
  process.exit(1);
});
