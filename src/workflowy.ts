import { readFileSync } from "node:fs";
import { WorkFlowy } from "workflowy";

type WorkFlowyDocument = Awaited<ReturnType<WorkFlowy["getDocument"]>>;
export type WFItem = WorkFlowyDocument["root"];

// Credentials live in PrivateConfig, never in a repository and never in an MCP
// client's config file -- the same rule the notify, mail-fetch and sheets-write
// tools follow. Override the location with WORKFLOWY_ENV.
const PRIVATE_CONFIG = "C:\\Users\\winke\\Documents\\PrivateConfig";
const DEFAULT_ENV_FILE = `${PRIVATE_CONFIG}\\workflowy.env`;

function envFilePath(): string {
  return process.env.WORKFLOWY_ENV || DEFAULT_ENV_FILE;
}

// Parse a KEY=value file the way the other machine-local tools do: skip blanks
// and # comments, split on the first =, trim both sides.
function readEnvFile(path: string): Record<string, string> {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return {};
  }
  const conf: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    conf[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return conf;
}

let client: WorkFlowy | null = null;

export function getClient(): WorkFlowy {
  if (client) return client;

  // An explicit environment variable still wins, so a one-off run can override
  // the file; otherwise the credential comes from PrivateConfig.
  const file = readEnvFile(envFilePath());
  const username = process.env.WORKFLOWY_USERNAME || file.WORKFLOWY_USERNAME;
  const password = process.env.WORKFLOWY_PASSWORD || file.WORKFLOWY_PASSWORD;
  if (!username || !password) {
    throw new Error(
      `Missing WorkFlowy credentials: expected WORKFLOWY_USERNAME and WORKFLOWY_PASSWORD in ${envFilePath()}. ` +
        "Create that file (override the location with WORKFLOWY_ENV, or set the variables in the environment). " +
        "Credentials belong in PrivateConfig -- never inside a repository. " +
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
  createdAt?: string;
  lastModifiedAt?: string;
  completedAt?: string;
  hasFile?: boolean;
  isMirror?: boolean;
  shared?: { viaEmail?: boolean; viaUrl?: boolean; url?: string };
  children?: SerializedItem[];
}

// Optional facts are emitted only when present or true, so the common case
// stays as small as before: 19k-node outlines make every extra byte count.
function iso(d: Date | undefined): string | undefined {
  return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : undefined;
}

export function serialize(item: WFItem, depth = 0): SerializedItem {
  const node: SerializedItem = {
    id: item.id,
    name: item.name,
    isCompleted: item.isCompleted,
    childCount: item.items.length,
  };
  if (item.note) node.note = item.note;
  const created = iso(item.createdAt);
  const modified = iso(item.lastModifiedAt);
  const completed = iso(item.completedAt);
  if (created) node.createdAt = created;
  if (modified) node.lastModifiedAt = modified;
  if (completed) node.completedAt = completed;
  if (item.hasFile) node.hasFile = true;
  if (item.isMirror) node.isMirror = true;
  if (item.isSharedViaEmail || item.isSharedViaUrl) {
    node.shared = {};
    if (item.isSharedViaEmail) node.shared.viaEmail = true;
    if (item.isSharedViaUrl) {
      node.shared.viaUrl = true;
      if (item.sharedUrl) node.shared.url = item.sharedUrl;
    }
  }
  if (depth > 0 && item.items.length > 0) {
    node.children = item.items.map((child) => serialize(child, depth - 1));
  }
  return node;
}

// WorkFlowy names carry inline HTML (<b>, colour spans, <time>, <a>). The
// path is for orientation, so it is shown as plain text.
function plainName(item: WFItem): string {
  return item.name.replace(/<[^>]+>/g, "").trim();
}

// Ancestor names from the top level down to the item's parent, joined with
// " > ". The root and the item itself are excluded; a top-level item has "".
export function pathOf(item: WFItem, root: WFItem): string {
  const names: string[] = [];
  let cur: WFItem | undefined = item.parent;
  while (cur && cur.id !== root.id) {
    names.unshift(plainName(cur));
    cur = cur.parent;
  }
  return names.join(" > ");
}

export interface SearchHit {
  id: string;
  name: string;
  note?: string;
  isCompleted: boolean;
  path: string;
  lastModifiedAt?: string;
}

export function search(doc: WorkFlowyDocument, query: string, limit: number): SearchHit[] {
  const needle = query.toLowerCase();
  const hits: SearchHit[] = [];
  walk(doc.root, (item) => {
    if (hits.length >= limit) return;
    const haystack = `${item.name}\n${item.note ?? ""}`.toLowerCase();
    if (haystack.includes(needle)) {
      const hit: SearchHit = {
        id: item.id,
        name: item.name,
        isCompleted: item.isCompleted,
        path: pathOf(item, doc.root),
      };
      if (item.note) hit.note = item.note;
      const modified = iso(item.lastModifiedAt);
      if (modified) hit.lastModifiedAt = modified;
      hits.push(hit);
    }
  });
  return hits;
}
