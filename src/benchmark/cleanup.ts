import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { WORKDIR_PREFIX, REGISTRY_FILE, RESULTS_DIR } from "./constants.ts";

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
	const script = String.raw`
		set +e
		dir=${JSON.stringify(dir)}
		dir_real=$(cd "$dir" 2>/dev/null && pwd -P || echo "$dir")
		roots=$(pgrep -f "$dir" 2>/dev/null; pgrep -f "$dir_real" 2>/dev/null)
		cwd_roots=$(lsof -d cwd -Fpn 2>/dev/null | awk -v d1="$dir" -v d2="$dir_real" '
			/^p/ { pid = substr($0, 2); next }
			/^n/ { cwd = substr($0, 2); if (index(cwd, d1) == 1 || index(cwd, d2) == 1) print pid }
		')
		roots=$(printf '%s\n%s\n' "$roots" "$cwd_roots" | grep -E '^[0-9]+$' | sort -u)
		[ -z "$roots" ] && exit 0
		all="$roots"; frontier="$roots"
		for _ in 1 2 3 4 5 6 7 8; do
			[ -z "$frontier" ] && break
			kids=$(printf '%s\n' $frontier | xargs -n1 pgrep -P 2>/dev/null | grep -E '^[0-9]+$' | sort -u)
			[ -z "$kids" ] && break
			new=$(printf '%s\n' $kids | grep -vxF -f <(printf '%s\n' $all) 2>/dev/null)
			[ -z "$new" ] && break
			all=$(printf '%s\n%s\n' "$all" "$new" | sort -u)
			frontier="$new"
		done
		printf '%s\n' $all | xargs kill 2>/dev/null
		sleep 0.5
		printf '%s\n' $all | xargs kill -9 2>/dev/null
		exit 0
	`;
	try {
		execSync(`bash -lc "${script}"`, { timeout: 10 });
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
