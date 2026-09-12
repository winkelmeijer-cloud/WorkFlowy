import { test } from "node:test";
import assert from "node:assert/strict";
import { serialize, search, pathOf } from "../dist/workflowy.js";

// Minimal stand-ins for the library's List objects: only the accessors our
// code reads. `parent` links are wired by mk().
function mk(props, children = []) {
  const item = {
    id: "id-" + props.name,
    name: props.name,
    note: props.note,
    isCompleted: props.isCompleted ?? false,
    createdAt: props.createdAt,
    lastModifiedAt: props.lastModifiedAt,
    completedAt: props.completedAt,
    hasFile: props.hasFile ?? false,
    isMirror: props.isMirror ?? false,
    isSharedViaUrl: props.isSharedViaUrl ?? false,
    isSharedViaEmail: props.isSharedViaEmail ?? false,
    sharedUrl: props.sharedUrl,
    items: children,
    parent: undefined,
  };
  for (const c of children) c.parent = item;
  return item;
}

const leaf = mk({
  name: "leaf",
  createdAt: new Date("2024-09-16T06:43:38Z"),
  lastModifiedAt: new Date("2026-09-08T07:40:47Z"),
});
const mid = mk({ name: '<b><span class="colored c-red">Mid</span></b>', isSharedViaEmail: true }, [leaf]);
const top = mk({ name: "Top", isSharedViaUrl: true, sharedUrl: "https://workflowy.com/s/x" }, [mid]);
const root = mk({ name: "" }, [top]);
const doc = { root };

test("serialize emits timestamps as ISO strings and omits absent ones", () => {
  const s = serialize(leaf);
  assert.equal(s.createdAt, "2024-09-16T06:43:38.000Z");
  assert.equal(s.lastModifiedAt, "2026-09-08T07:40:47.000Z");
  assert.equal("completedAt" in s, false);
  assert.equal("hasFile" in s, false);
  assert.equal("isMirror" in s, false);
  assert.equal("shared" in s, false);
});

test("serialize reports sharing only when present", () => {
  assert.deepEqual(serialize(mid).shared, { viaEmail: true });
  assert.deepEqual(serialize(top).shared, { viaUrl: true, url: "https://workflowy.com/s/x" });
});

test("serialize reports completedAt, hasFile and isMirror when set", () => {
  const done = mk({ name: "done", isCompleted: true, completedAt: new Date("2026-01-02T03:04:05Z"), hasFile: true, isMirror: true });
  const s = serialize(done);
  assert.equal(s.completedAt, "2026-01-02T03:04:05.000Z");
  assert.equal(s.hasFile, true);
  assert.equal(s.isMirror, true);
});

test("pathOf lists ancestor names, tags stripped, root excluded, node itself excluded", () => {
  assert.equal(pathOf(leaf, root), "Top > Mid");
  assert.equal(pathOf(top, root), "");
});

test("search hits carry path and lastModifiedAt", () => {
  const hits = search(doc, "LEAF", 10);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].path, "Top > Mid");
  assert.equal(hits[0].lastModifiedAt, "2026-09-08T07:40:47.000Z");
});

test("search still matches notes and respects limit", () => {
  const a = mk({ name: "a", note: "needle here" });
  const b = mk({ name: "needle b" });
  const r = mk({ name: "" }, [a, b]);
  assert.equal(search({ root: r }, "needle", 10).length, 2);
  assert.equal(search({ root: r }, "needle", 1).length, 1);
});
