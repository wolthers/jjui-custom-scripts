import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  forgetWorkspaceRecord,
  lookupWorkspacePath,
  rememberWorkspace,
} from "./registry.js";

describe("workspace registry", () => {
  let repoRoot: string;

  function makeRepo() {
    repoRoot = mkdtempSync(join(tmpdir(), "jj-scripts-registry-"));
    return repoRoot;
  }

  function cleanup() {
    if (repoRoot) {
      try {
        rmSync(repoRoot, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  }

  it("returns undefined for unknown workspace when no registry file exists", async () => {
    makeRepo();
    try {
      const path = await lookupWorkspacePath(repoRoot, "any");
      expect(path).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it("remembers and looks up workspace path", async () => {
    makeRepo();
    try {
      await rememberWorkspace({
        repoRoot,
        workspace: "my-ws",
        path: "/path/to/ws",
      });
      const path = await lookupWorkspacePath(repoRoot, "my-ws");
      expect(path).toBe("/path/to/ws");
    } finally {
      cleanup();
    }
  });

  it("forgetWorkspaceRecord removes workspace from registry", async () => {
    makeRepo();
    try {
      await rememberWorkspace({
        repoRoot,
        workspace: "my-ws",
        path: "/path/to/ws",
      });
      expect(await lookupWorkspacePath(repoRoot, "my-ws")).toBe("/path/to/ws");
      await forgetWorkspaceRecord(repoRoot, "my-ws");
      expect(await lookupWorkspacePath(repoRoot, "my-ws")).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it("forgetWorkspaceRecord is no-op when workspace not in registry", async () => {
    makeRepo();
    try {
      await forgetWorkspaceRecord(repoRoot, "missing");
      expect(await lookupWorkspacePath(repoRoot, "missing")).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it("throws on invalid registry format", async () => {
    makeRepo();
    try {
      const registryPath = join(repoRoot, ".jj", "jj-scripts-workspaces.json");
      const dir = join(repoRoot, ".jj");
      const { mkdirSync } = await import("node:fs");
      mkdirSync(dir, { recursive: true });
      writeFileSync(registryPath, '{"version":2,"workspaces":{}}', "utf8");
      await expect(lookupWorkspacePath(repoRoot, "x")).rejects.toThrow(
        /Invalid workspace registry format/,
      );
    } finally {
      cleanup();
    }
  });
});
