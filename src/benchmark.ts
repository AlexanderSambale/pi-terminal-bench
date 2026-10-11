import type { UIAdapter } from "./benchmark/types";

import {
	benchListHandler,
	benchRunHandler,
	benchDoctorHandler,
	benchResultsHandler,
	benchCleanupHandler
} from "./benchmark/commands";
import { execSync } from "node:child_process";
import { formatCategorySummary } from "./benchmark/tasks";
import { makeUIAdapter } from "./benchmark/ui";

/** Session-end stray pi-bench process cleanup. */
export function _sweepStrays(): number {
	let pids = "";
	try {
		pids = execSync(String.raw`pgrep -f 'pi-bench\.' 2>/dev/null || true`, { encoding: "utf-8" }).trim();
	} catch {
		pids = "";
	}
	if (!pids) return 0;

	let killed = 0;
	for (const pid of pids.split("\n")) {
		try {
			execSync(`kill -9 ${pid}`, { timeout: 1 });
			killed++;
		} catch { /* best-effort */ }
	}
	return killed;
}

// ── Top-level dispatcher — routes CLI args to imported handlers ─────────

/** Main entry — parses /bench-* style args and dispatches to imported handlers. */
export function terminalBench(args: string, ui: UIAdapter = makeUIAdapter()): void {
	const parts = args.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) {
		const doctorCmd = [
			"which python3",
			"python3 --version",
			"which jq",
			"which node",
		].map((cmd) => `${cmd} 2>&1 || echo 'NOT_FOUND'`);

		try {
			const doctorResult = execSync(doctorCmd.join("\n"), { timeout: 5000 }).toString();
			ui.notify(`Prerequisites:\n${doctorResult}`, "info");
		} catch {
			ui.notify("Doctor check failed", "error");
		}
		ui.notify(formatCategorySummary([]), "info");
		return;
	}

	const mode = parts[0].toLowerCase();
	const rest = parts.slice(1).join(" ");

	switch (mode) {
		case "list":
			benchListHandler(ui, rest);
			break;
		case "run":
			benchRunHandler(ui, rest);
			break;
		case "doctor":
			benchDoctorHandler(ui, "");
			break;
		case "results":
			benchResultsHandler(ui, rest);
			break;
		case "cleanup":
			benchCleanupHandler(ui, "");
			break;
		default:
			ui.notify(`Unknown mode '${mode}'. Use list|run|doctor|results|cleanup.`, "error");
	}
}

export default terminalBench;
