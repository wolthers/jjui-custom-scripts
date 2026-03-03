import { describe, expect, it } from "vitest";
import { buildStackBlock, stripSyncBlock } from "./sync.js";

describe("stripSyncBlock", () => {
  const SYNC_START = "<!-- jj-scripts-sync -->";
  const SYNC_END = "<!-- /jj-scripts-sync -->";

  it("returns empty string for null body", () => {
    expect(stripSyncBlock(null)).toBe("");
  });

  it("returns trimmed body when no sync block present", () => {
    expect(stripSyncBlock("Hello world\n\n")).toBe("Hello world");
  });

  it("strips sync block from end of body", () => {
    const body = `Some PR description\n\n${SYNC_START}\n> stack info\n${SYNC_END}`;
    expect(stripSyncBlock(body)).toBe("Some PR description");
  });

  it("strips sync block from middle of body", () => {
    const body = `Before\n\n${SYNC_START}\n> stack\n${SYNC_END}\nAfter`;
    expect(stripSyncBlock(body)).toBe("Before\n\nAfter");
  });

  it("handles sync block at start of body", () => {
    const body = `${SYNC_START}\n> stack\n${SYNC_END}\n\nAfter the block`;
    expect(stripSyncBlock(body)).toBe("\n\nAfter the block");
  });

  it("handles body that is only a sync block", () => {
    const body = `${SYNC_START}\n> stack\n${SYNC_END}`;
    expect(stripSyncBlock(body)).toBe("");
  });

  it("strips content from unclosed start marker onward when end marker missing", () => {
    const body = `Before\n\n${SYNC_START}\n> orphaned`;
    const result = stripSyncBlock(body);
    expect(result).toContain("Before");
    expect(result).toContain(SYNC_START);
  });
});

describe("buildStackBlock", () => {
  it("produces sync-delimited markdown block", () => {
    const entries = [
      { branch: "feat-a", url: "https://github.com/o/r/pull/1" },
      { branch: "feat-b", url: "https://github.com/o/r/pull/2" },
    ];
    const block = buildStackBlock(entries);
    expect(block).toContain("<!-- jj-scripts-sync -->");
    expect(block).toContain("<!-- /jj-scripts-sync -->");
    expect(block).toContain("> - [feat-a](https://github.com/o/r/pull/1)");
    expect(block).toContain("> - [feat-b](https://github.com/o/r/pull/2)");
    expect(block).toContain("part of a stack");
  });

  it("includes attribution line", () => {
    const block = buildStackBlock([
      { branch: "x", url: "https://example.com" },
    ]);
    expect(block).toContain("jj-scripts");
  });

  it("handles single entry", () => {
    const block = buildStackBlock([
      { branch: "only", url: "https://github.com/o/r/pull/99" },
    ]);
    expect(block).toContain("> - [only](https://github.com/o/r/pull/99)");
  });
});
