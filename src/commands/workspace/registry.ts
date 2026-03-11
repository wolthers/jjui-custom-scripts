import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { jjCapture, splitLines } from "../../lib/jj.js";

type WorkspaceRecord = {
  path: string;
  createdAt: string;
  bookmark?: string;
};

type WorkspaceRegistry = {
  version: 1;
  workspaces: Record<string, WorkspaceRecord>;
};

export const parseWorkspaceNameLine = (line: string): string => {
  const trimmed = line.trim();
  if (trimmed.length === 0) return "";
  if (trimmed.startsWith('"')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === "string") return parsed;
    } catch {
      // fall through
    }
  }
  return trimmed;
};

export async function listJjWorkspaceNames(
  repoRoot: string,
): Promise<string[]> {
  const raw = await jjCapture(["workspace", "list", "-T", 'name ++ "\\n"'], {
    cwd: repoRoot,
  });
  return splitLines(raw)
    .map(parseWorkspaceNameLine)
    .filter((s) => s.length > 0);
}

export type RegistryOutOfSyncReason = "missing-folder" | "missing-jj-workspace";

export type RegistryOutOfSyncRecord = {
  workspace: string;
  path: string;
  reason: RegistryOutOfSyncReason;
  folderExists: boolean;
};

const REGISTRY_RELATIVE_PATH = ".jj/jj-scripts-workspaces.json";

const defaultRegistry = (): WorkspaceRegistry => ({
  version: 1,
  workspaces: {},
});

const registryPath = (repoRoot: string): string =>
  join(repoRoot, REGISTRY_RELATIVE_PATH);

const parseRegistry = (raw: string): WorkspaceRegistry => {
  const data: unknown = JSON.parse(raw);
  if (
    typeof data === "object" &&
    data !== null &&
    "version" in data &&
    (data as { version?: unknown }).version === 1 &&
    "workspaces" in data &&
    typeof (data as { workspaces?: unknown }).workspaces === "object" &&
    (data as { workspaces?: unknown }).workspaces !== null
  ) {
    return data as WorkspaceRegistry;
  }
  throw new Error(
    `Invalid workspace registry format in ${REGISTRY_RELATIVE_PATH}`,
  );
};

async function loadRegistry(repoRoot: string): Promise<WorkspaceRegistry> {
  const path = registryPath(repoRoot);
  try {
    const raw = await readFile(path, "utf8");
    return parseRegistry(raw);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return defaultRegistry();
    }
    throw error;
  }
}

async function saveRegistry(
  repoRoot: string,
  registry: WorkspaceRegistry,
): Promise<void> {
  await mkdir(join(repoRoot, ".jj"), { recursive: true });
  await writeFile(
    registryPath(repoRoot),
    `${JSON.stringify(registry, null, 2)}\n`,
    "utf8",
  );
}

export async function rememberWorkspace(params: {
  repoRoot: string;
  workspace: string;
  path: string;
  bookmark?: string;
}): Promise<void> {
  const registry = await loadRegistry(params.repoRoot);
  registry.workspaces[params.workspace] = {
    path: params.path,
    createdAt: new Date().toISOString(),
    ...(params.bookmark ? { bookmark: params.bookmark } : {}),
  };
  await saveRegistry(params.repoRoot, registry);
}

export async function listRegistryWorkspaceNames(
  repoRoot: string,
): Promise<string[]> {
  const registry = await loadRegistry(repoRoot);
  return Object.keys(registry.workspaces).toSorted();
}

export async function lookupWorkspacePath(
  repoRoot: string,
  workspace: string,
): Promise<string | undefined> {
  const registry = await loadRegistry(repoRoot);
  return registry.workspaces[workspace]?.path;
}

export async function lookupWorkspaceBookmark(
  repoRoot: string,
  workspace: string,
): Promise<string | undefined> {
  const registry = await loadRegistry(repoRoot);
  return registry.workspaces[workspace]?.bookmark;
}


export async function forgetWorkspaceRecord(
  repoRoot: string,
  workspace: string,
): Promise<void> {
  const registry = await loadRegistry(repoRoot);
  if (!(workspace in registry.workspaces)) {
    return;
  }
  delete registry.workspaces[workspace];
  await saveRegistry(repoRoot, registry);
}

const existsOnDisk = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
};

export async function reconcileWorkspaceRegistry(params: {
  repoRoot: string;
  jjWorkspaceNames: Iterable<string>;
}): Promise<RegistryOutOfSyncRecord[]> {
  const registry = await loadRegistry(params.repoRoot);
  const jjNames = new Set(params.jjWorkspaceNames);
  const outOfSync: RegistryOutOfSyncRecord[] = [];
  const entries = Object.entries(registry.workspaces);
  const checks = await Promise.all(
    entries.map(async ([workspace, record]) => ({
      workspace,
      path: record.path,
      folderExists: await existsOnDisk(record.path),
    })),
  );

  for (const check of checks) {
    if (!jjNames.has(check.workspace)) {
      outOfSync.push({
        workspace: check.workspace,
        path: check.path,
        reason: "missing-jj-workspace",
        folderExists: check.folderExists,
      });
      delete registry.workspaces[check.workspace];
      continue;
    }
    if (!check.folderExists) {
      outOfSync.push({
        workspace: check.workspace,
        path: check.path,
        reason: "missing-folder",
        folderExists: false,
      });
      delete registry.workspaces[check.workspace];
    }
  }

  if (outOfSync.length > 0) {
    await saveRegistry(params.repoRoot, registry);
  }

  return outOfSync;
}
