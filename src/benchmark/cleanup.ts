import { existsSync, readFileSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { WORKDIR_PREFIX, REGISTRY_FILE, PACKAGE_DIR } from "./constants.ts";

/** Workspaces currently owned by a running task. Swept on session shutdown. */
const activeWorkDirs = new Set<string>();

/** Only treat a path as benchmark-owned if it carries our prefix. */
export function isOwnedWorkDir(dir: string): boolean {
	if (!dir) return false;
	const base = path.basename(dir);
	return base.startsWith(`${WORKDIR_PREFIX}.`);
}

export function registerWorkDir(dir: string): void {
	if (!isOwnedWorkDir(dir)) return;
	activeWorkDirs.add(dir);
	try {
		appendFileSync(REGISTRY_FILE, dir + "\n");
	} catch { /* best-effort */ }
}

function unregisterWorkDir(dir: string): void {
	activeWorkDirs.delete(dir);
	try {
		if (!existsSync(REGISTRY_FILE)) return;
		const remaining = readFileSync(REGISTRY_FILE, "utf-8")
			.split("\n")
			.filter((line) => line && line !== dir);
		writeFileSync(REGISTRY_FILE, remaining.length ? remaining.join("\n") + "\n" : "");
	} catch { /* best-effort */ }
}

/** Read the persisted registry — used to recover orphans from crashed sessions. */
export function readRegistry(): string[] {
	try {
		if (!existsSync(REGISTRY_FILE)) return [];
		return readFileSync(REGISTRY_FILE, "utf-8")
			.split("\n")
			.map((l) => l.trim())
			.filter((l) => l && isOwnedWorkDir(l));
	} catch {
		return [];
	}
}

/**
 * Kill processes associated with `dir`. Pure Node.js — uses spawn/execSync.
 * Finds roots two ways — argv references the dir, or cwd is under the dir —
 * then walks descendants with pgrep -P before killing, so orphaned
 * grandchildren are caught before reparenting to launchd loses them.
 */
export function killProcessesInDir(dir: string): void {
	if (!dir) return;
	try {
		execSync(`bash -lc "${PACKAGE_DIR}/killProcessesInDir.sh"`, { timeout: 10 });
	} catch { /* best-effort */ }
}

/** Remove a temp workspace directory and drop it from the registry. */
export function cleanupWorkDir(dir: string): void {
	unregisterWorkDir(dir);
	if (!isOwnedWorkDir(dir)) return;
	try {
		rmSync(dir, { recursive: true, force: true });
	} catch { /* best-effort */ }
}

/** Register + kill helper — used by cleanup handler. */
export function sweepWorkdir(dir: string): void {
	registerWorkDir(dir); // ensure tracked if missed earlier
	if (isOwnedWorkDir(dir)) killProcessesInDir(dir);
	cleanupWorkDir(dir);
}
