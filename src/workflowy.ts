import { WorkFlowy } from "workflowy";

type WorkFlowyDocument = Awaited<ReturnType<WorkFlowy["getDocument"]>>;
export type WFItem = WorkFlowyDocument["root"];

let client: WorkFlowy | null = null;

export function getClient(): WorkFlowy {
  if (client) return client;

  const username = process.env.WORKFLOWY_USERNAME;
  const password = process.env.WORKFLOWY_PASSWORD;
  if (!username || !password) {
    throw new Error(
      "Missing credentials: set WORKFLOWY_USERNAME and WORKFLOWY_PASSWORD in the environment. " +
        "Note: accounts with 2FA/one-time codes are not supported by the underlying library.",
    );
  }

  client = new WorkFlowy(username, password);
  return client;
}

// Always fetch a fresh document so reads reflect current state and mutations
// apply to an up-to-date tree.
export function loadDocument(): Promise<WorkFlowyDocument> {
  return getClient().getDocument();
}

function walk(item: WFItem, visit: (i: WFItem) => void): void {
  for (const child of item.items) {
    visit(child);
    walk(child, visit);
  }
}

export function findById(doc: WorkFlowyDocument, id: string): WFItem | undefined {
  let found: WFItem | undefined;
  walk(doc.root, (item) => {
    if (item.id === id) found = item;
  });
  return found;
}

export interface SerializedItem {
  id: string;
  name: string;
  note?: string;
  isCompleted: boolean;
  childCount: number;
  children?: SerializedItem[];
}

export function serialize(item: WFItem, depth = 0): SerializedItem {
  const node: SerializedItem = {
    id: item.id,
    name: item.name,
    isCompleted: item.isCompleted,
    childCount: item.items.length,
  };
  if (item.note) node.note = item.note;
  if (depth > 0 && item.items.length > 0) {
    node.children = item.items.map((child) => serialize(child, depth - 1));
  }
  return node;
}

export interface SearchHit {
  id: string;
  name: string;
  note?: string;
  isCompleted: boolean;
}

export function search(doc: WorkFlowyDocument, query: string, limit: number): SearchHit[] {
  const needle = query.toLowerCase();
  const hits: SearchHit[] = [];
  walk(doc.root, (item) => {
    if (hits.length >= limit) return;
    const haystack = `${item.name}\n${item.note ?? ""}`.toLowerCase();
    if (haystack.includes(needle)) {
      const hit: SearchHit = { id: item.id, name: item.name, isCompleted: item.isCompleted };
      if (item.note) hit.note = item.note;
      hits.push(hit);
    }
  });
  return hits;
}
