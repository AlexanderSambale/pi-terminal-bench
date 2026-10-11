import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { TaskDef } from "./types";
import { TASKS_DIR, CATEGORIES } from "./constants";

/** Load a single task definition by name — tries .json then bare name. */
export function loadTask(name: string): TaskDef | null {
	const candidates = [
		path.join(TASKS_DIR, `${name}.json`),
		path.join(TASKS_DIR, name),
	];
	for (const p of candidates) {
		if (existsSync(p)) {
			try {
				return JSON.parse(readFileSync(p, "utf-8"));
			} catch {
				return null;
			}
		}
	}
	return null;
}

/** List tasks — optional filter by name/dataset/tags. */
export function listTasks(filter?: string): TaskDef[] {
	if (!existsSync(TASKS_DIR)) return [];
	const files = readdirSync(TASKS_DIR).filter((f) => f.endsWith(".json")).sort();
	const tasks: TaskDef[] = [];
	for (const file of files) {
		try {
			const task: TaskDef = JSON.parse(readFileSync(path.join(TASKS_DIR, file), "utf-8"));
			if (filter) {
				const q = filter.toLowerCase();
				if (
					task.name.toLowerCase().includes(q) ||
					(task.dataset ?? "").toLowerCase().includes(q) ||
					task.tags.some((t) => t.toLowerCase().includes(q))
				) {
					tasks.push(task);
				}
			} else {
				tasks.push(task);
			}
		} catch { /* skip corrupt */ }
	}
	return tasks;
}

/** Build the /bench-list summary string (no-args category breakdown). */

export function formatCategorySummary(all: TaskDef[]): string {
	const lines: string[] = [];
	for (const cat of CATEGORIES) {
		const count = all.filter(cat.match).length;
		if (count > 0) {
			lines.push(`  ${cat.key} (${count}) — ${cat.desc}`);
		}
	}
	const categorized = all.filter((t) => CATEGORIES.some((c) => c.match(t)));
	const uncategorized = all.length - categorized.length;
	if (uncategorized > 0) {
		lines.push(`  other (${uncategorized}) — Uncategorized tasks`);
	}
	return `${all.length} tasks in ${CATEGORIES.length} categories:\n${lines.join("\n")}\n\nRun a category:  /bench-run quixbugs\nRun a single task:  /bench-run quixbugs-python-flatten\nRun everything:  /bench-run all`;
}
