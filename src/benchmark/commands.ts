import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { runSingleTask } from "./runSingleTask.ts";
import * as path from "node:path";
import type { ResolvedTasks, RunTask, TaskDef, TaskResult, TaskResults, TaskResultsStats, UIAdapter } from "./types.ts";
import { LOGS_DIR, RESULTS_DIR, STATUS_KEY } from "./constants.ts";
import { formatCategorySummary as fmtCatSummaryRaw, listTasks, loadTask } from "./tasks.ts";


/** Format the /bench-list category summary (re-exported). */
export function formatCategorySummary(): string {
	return fmtCatSummaryRaw(listTasks());
}

/** Parse `/bench-run` arguments into targets and model. */
export function parseArgs(args: string): { targets: string[]; requestedModel: string } {
	const parts = args.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) return { targets: [], requestedModel: "" };

	const targets: string[] = [];
	let requestedModel = "";
	for (let i = 0; i < parts.length; i++) {
		const part = parts[i];
		if (part === "--model") {
			// Next token is the model value
			i++;
			requestedModel = parts[i];
		} else {
			targets.push(part);
		}
	}
	return { targets, requestedModel };
}

/** Resolve a TaskDef[] from parsed targets. Returns [] to signal empty. */
function resolveTasks(targets: string[]): ResolvedTasks {
	if (targets.length === 1 && targets[0].toLowerCase() === "all") {
		return { tasks: listTasks(), runLabel: "all"};
	}
	const tasks: TaskDef[] = [];
	for (const target of targets) {
		const exactTask = loadTask(target);
		if (exactTask) {
			// Avoid duplicates
			if (!tasks.some((t) => t.name === exactTask.name)) {
				tasks.push(exactTask);
			}
		} else {
			// Try as category/filter
			const matched = listTasks(target);
			for (const t of matched) {
				if (!tasks.some((existing) => existing.name === t.name)) {
					tasks.push(t);
				}
			}
		}
	}
	return { tasks, runLabel: targets.join(" ") };
}

/** Pure formatting for per-task assessment output. */
function notifyAssessment(
	ui: UIAdapter,
	result: TaskResult,
	taskName: string,
	passedCount: number,
	totalCompleted: number,
	isBatch: boolean,
	total: number
) {
	const dur = result.duration_ms < 1000
		? `${result.duration_ms}ms`
		: `${Math.round(result.duration_ms / 1000)}s`;
	const border = result.status === "pass" ? "=" : "!";
	const line = border.repeat(60);

	let assessment = `\n${line}\n`;
	if (result.status === "pass") assessment += `  PASS  ${taskName}  (${dur})`;
	else if (result.status === "timeout") assessment += `  TIMEOUT  ${taskName}  (${dur})`;
	else assessment += `  FAIL  ${taskName}  (${dur})`;

	if (result.verify_output) {
		assessment += `\n\n  Verification:\n`;
		for (const vline of result.verify_output.split("\n").slice(0, 15)) assessment += `    ${vline}\n`;
	}
	if (isBatch) assessment += `\n  Score: ${passedCount} passed, ${totalCompleted - passedCount} failed - out of ${totalCompleted} (${total - totalCompleted} remaining)`;
	assessment += `\n${line}`;
	ui.notify(assessment, result.status === "pass" ? "info" : "error");
}

/** Initial batch banner and status. */
function initBatchBanner(ui: UIAdapter, total: number, label: string, selectedModel: string): void {
	ui.notify(`Running ${total} tasks [${label}] with ${selectedModel}\n${"═".repeat(60)}`, "info");
	ui.setStatus(STATUS_KEY, `bench: 0/${total} passed | starting...`);
}

/** Render per-task banner with optional batch prefix. */
function buildBanner(ui: UIAdapter, isBatch: boolean, current: number, total: number, task: TaskDef): void {
	const progress = isBatch ? `[${current}/${total}] ` : "";
	ui.notify(`\n${"═".repeat(60)}\n${progress}TASK: ${task.name}\n${task.description}\n${"═".repeat(60)}`, "info");
}

/** Live batch status line mid-loop. */
function updateStatus(ui: UIAdapter, key: string, passed: number, idx: number, taskName: string, total: number): void {
	ui.setStatus(key, `bench: ${passed}/${idx} passed | running ${taskName} (${idx + 1}/${total})`);
}

/** Batch percentage status line. */
function updateBatchPct(ui: UIAdapter, key: string, passed: number, idx: number, total: number): void {
	const pct = Math.round((passed / (idx + 1)) * 100);
	ui.setStatus(key, `bench: ${passed}/${idx} passed (${pct}%) | ${total - idx} remaining`);
}

/** Check abort signal; returns true if aborted (and notifies). */
function checkAbort(ui: UIAdapter): boolean {
	// SAFETY: globalThis cast to abort-signal shape — caller wires real signal channel.
	const __abortSignal = (globalThis as unknown as { signal?: { aborted: boolean } }).signal;
	if (__abortSignal?.aborted) {
		ui.notify("Benchmark aborted by user.", "warning");
		return true;
	}
	return false;
}

function updateUIBeforeTask(ui: UIAdapter, isBatch: boolean, index: number, total: number, passed: number, task: TaskDef) {
	buildBanner(ui, isBatch, index + 1, total, task);
	if (isBatch) updateStatus(ui, STATUS_KEY, passed, index, task.name, total);
}

function updateUIAfterTask(ui: UIAdapter, isBatch: boolean, index: number, total: number, passed: number, task: TaskDef, result: TaskResult) {
	notifyAssessment(ui, result, task.name, passed, index + 1, isBatch, total);
	if (isBatch) updateBatchPct(ui, STATUS_KEY, passed, index + 1, total);
}

async function taskLoop(ui: UIAdapter, tasks: TaskDef[], isBatch: boolean, selectedModel: string, taskResultsStats: TaskResultsStats, runTask: RunTask): Promise<TaskResults> {
	const results: TaskResult[] = [];
	let { total, passed, failed } = taskResultsStats;

	mkdirSync(RESULTS_DIR, { recursive: true });
	mkdirSync(LOGS_DIR, { recursive: true });

	for (let i = 0; i < total; i++) {
		const task = tasks[i];

		updateUIBeforeTask(ui, isBatch, i, total, passed, task); 

		const result = await runTask(task, selectedModel);
		results.push(result);
		if (result.status === "pass") passed++; else failed++;
		updateUIAfterTask(ui, isBatch, i, total, passed, task, result);
		
		if (checkAbort(ui)) break;
	}
	return { results, taskResultsStats: { total, passed, failed } };
}

function resultForBatch(ui: UIAdapter, selectedModel: string, runLabel: string, taskResults: TaskResults) {
	const { results, taskResultsStats } = taskResults;
	ui.setStatus(STATUS_KEY, undefined);
	const ts = new Date().toISOString().replace(/[:.]/g, "-");
	const resultFile = path.join(RESULTS_DIR, `run-${ts}.json`);
	const pct = Math.round((taskResultsStats.passed / taskResultsStats.total) * 100);
	writeFileSync(resultFile, JSON.stringify({ model: selectedModel, filter: runLabel, timestamp: new Date().toISOString(), summary: taskResultsStats, results }, null, 2));
	ui.notify(`\n${"═".repeat(60)}\n  FINAL SCORE: ${taskResultsStats.passed}/${taskResultsStats.total} passed (${pct}%)\n  Model: ${selectedModel}\n  Failed: ${taskResultsStats.failed}\n  Results: ${resultFile}\n${"═".repeat(60)}`, taskResultsStats.failed === 0 ? "info" : "error");
}

/** Run handler — /bench-run <task|category|all> [...more] [provider/model]. */
export async function benchRunHandler(ui: UIAdapter, args: string): Promise<void> {
	const { targets, requestedModel } = parseArgs(args);
	if (targets.length === 0) {
		ui.notify(
			`Usage: /bench-run <task|category|all> [...more tasks] [provider/model]\n\n${formatCategorySummary()}`,
			"warning",
		);
		return;
	}

	const { tasks, runLabel }  = resolveTasks(targets);
	if (tasks.length === 0) {
		ui.notify(`No tasks found matching '${runLabel}'. Use /bench-list to see available tasks and categories.`, "error");
		return;
	}

	let taskResultsStats: TaskResultsStats = { 
		passed: 0,
		failed: 0,
		total: tasks.length,
	};
	const isBatch = taskResultsStats.total > 1;
	const selectedModel = requestedModel || ""

	initBatchBanner(ui, taskResultsStats.total, targets.join(" "), selectedModel);

	const taskResults = await taskLoop(ui, tasks, isBatch, selectedModel, taskResultsStats, runSingleTask);

	if (isBatch) {
		resultForBatch(ui, selectedModel, runLabel, taskResults);
	}
}

/** List handler — /bench-list [filter]. */
export async function benchListHandler(ui: UIAdapter, args: string): Promise<void> {
	const filter = args.trim() || undefined;
	if (!filter) { ui.notify(formatCategorySummary(), "info"); return; }
	const tasks = listTasks(filter);
	if (tasks.length === 0) { ui.notify(`No tasks found matching '${filter}'`, "warning"); return; }
	const lines = tasks.map((t) => `  ${t.name}  (${t.tags.join(", ")})`);
	ui.notify(`${tasks.length} tasks matching '${filter}':\n${lines.join("\n")}`, "info");
}

/** Doctor handler — /bench-doctor. */
export async function benchDoctorHandler(ui: UIAdapter, _args: string): Promise<void> {
	const script = [
		"set -e",
		`echo "python3: $(command -v python3 >/dev/null 2>&1 && python3 --version 2>/dev/null || echo 'not found')"`,
	].join("; ");

	try {
		const result = execSync(`bash -lc "${script}"`).toString();
		ui.notify(`${result.trim()}\nmodel: (none)\ntasks: unknown\n`, "info");
	} catch { ui.notify("Doctor check failed", "error"); }
}

/** Results handler — /bench-results [N]. */
export async function benchResultsHandler(ui: UIAdapter, args: string): Promise<void> {
	if (!existsSync(RESULTS_DIR)) { ui.notify("No results yet. Run a task first.", "info"); return; }
	const files = readdirSync(RESULTS_DIR).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, 10);
	if (files.length === 0) { ui.notify("No results yet.", "info"); return; }

	const runIndex = parseInt(args.trim(), 10);
	if (!isNaN(runIndex) && runIndex >= 1 && runIndex <= files.length) {
		type ResultData = { model: string; filter?: string; timestamp: string; summary: { total: number; passed: number; failed: number }; results: TaskResult[] };
		let data: ResultData;
		try { data = JSON.parse(readFileSync(path.join(RESULTS_DIR, files[runIndex - 1]!), "utf-8")); } catch { ui.notify(`Failed to parse ${path.basename(files[runIndex - 1]!)}`, "error"); return; }
		const s = data.summary;
		// SAFETY: data coercions below rely on well-formed JSON from /results — malformed files caught above.

		const header = `${data.model} — ${s.passed}/${s.total} passed (${Math.round((s.passed / s.total) * 100)}%)\n${data.timestamp}\n${data.filter ? `Filter: ${data.filter}` : "All tasks"}\n`;

		const passedTasks: string[] = [], failedTasks: string[] = [];
		// SAFETY: data.results cast — well-formed JSON from /results guarantees shape.
		for (const r of data.results as TaskResult[]) {
			const tag = r.status === "pass" ? "PASS" : r.status === "timeout" ? "TIME" : "FAIL";
			const dur = r.duration_ms < 1000 ? `${r.duration_ms}ms` : `${Math.round(r.duration_ms / 1000)}s`;
			if (r.status === "pass") passedTasks.push(`  [${tag}] ${r.task} (${dur})`);
			else failedTasks.push(`  [${tag}] ${r.task} (${dur}) — ${r.verify_output.split("\n")[0]?.slice(0, 80)}`);
		}

		let output = header;
		if (failedTasks.length > 0) output += `\nFailed (${failedTasks.length}):\n${failedTasks.join("\n")}`;
		if (passedTasks.length > 0) output += `\nPassed (${passedTasks.length}):\n${passedTasks.join("\n")}`;
		ui.notify(output, failedTasks.length > 0 ? "error" : "info");
	} else {
		const lines: string[] = [];
		for (let i = 0; i < files.length; i++) {
			type ResultData = { model: string; filter?: string; timestamp: string; summary: { total: number; passed: number; failed: number }; results: TaskResult[] };
			let data: ResultData;
			try { data = JSON.parse(readFileSync(path.join(RESULTS_DIR, files[i]!), "utf-8")); } catch { ui.notify(`Failed to parse ${path.basename(files[i]!)}`, "error"); return; }
			const s = data.summary;

			lines.push(`  ${i + 1}. ${data.model} — ${s.passed}/${s.total} (${Math.round((s.passed / s.total) * 100)}%) — ${data.timestamp}`);
		}
		ui.notify(`Recent runs (use /bench-results <N> for details):\n${lines.join("\n")}`, "info");
	}
}

/** Cleanup handler — /bench-cleanup. */
export async function benchCleanupHandler(ui: UIAdapter, _args: string): Promise<void> {
	const script = `set +e\narg_roots=$(pgrep -f '/pi-bench\\.' 2>/dev/null)\ncwd_roots=$(lsof -d cwd -Fpn 2>/dev/null | awk '/^p/ { pid = substr($0, 2); next } /^n/ { cwd = substr($0, 2); if (cwd ~ /pi-bench\\./) print pid }')\nroots=$(printf '%s\\n%s\\n' "$arg_roots" "$cwd_roots" | grep -E '^[0-9]+$' | sort -u)\n[ -z "$roots" ] && echo "No stray pi-bench.* processes found." && exit 0\nall="$roots"; frontier="$roots"\nfor _ in 1 2 3 4 5 6 7 8; do [ -z "$frontier" ] && break; kids=$(printf '%s\\n' $frontier | xargs -n1 pgrep -P 2>/dev/null | grep -E '^[0-9]+$' | sort -u); [ -z "$kids" ] && break; new=$(printf '%s\\n' $kids | grep -vxF -f <(printf '%s\\n' $all) 2>/dev/null); [ -z "$new" ] && break; all=$(printf '%s\\n%s\\n' "$all" "$new" | sort -u); frontier="$new"; done\necho "Killing processes under pi-bench.* workspaces:"; for pid in $all; do cmd=$(ps -p "$pid" -o args= 2>/dev/null); [ -n "$cmd" ] && echo "  PID $pid: $cmd"; done\nprintf '%s\\n' $all | xargs kill 2>/dev/null; sleep 0.5; printf '%s\\n' $all | xargs kill -9 2>/dev/null\necho "Killed."`;
	try {
		const result = execSync(`bash -lc "${script}"`).toString();
		ui.notify(result.trim() || "Cleanup complete.", "info");
	} catch { ui.notify("Cleanup failed.", "error"); }
}
