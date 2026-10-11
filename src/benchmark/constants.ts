import path from "node:path";
// Category definitions — each match() checks task.name prefix.
import type { TaskDef } from "./types.ts";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PACKAGE_DIR = path.resolve(__dirname, "../..");
export const TASKS_DIR = path.join(PACKAGE_DIR, "tasks");
export const STATE_DIR = path.join(PACKAGE_DIR, "state");
export const RESULTS_DIR = path.join(STATE_DIR, "results");
export const STATUS_KEY = "terminal-bench";

// All benchmark workspaces are named with this prefix so cleanup can
// target only directories we created. `mktemp -d -t pi-bench` produces
// $TMPDIR/pi-bench.XXXXXX on macOS — distinct from generic tmp.XXXXXX
// paths that git, homebrew, xcode, and other tools create.
export const WORKDIR_PREFIX = "pi-bench";

// Registry of in-flight workspaces, persisted so a crashed pi session's
// orphans can be recovered by /bench-cleanup on the next run.
export const REGISTRY_FILE = path.join(STATE_DIR, "active-workdirs.txt");

export const CATEGORIES: { key: string; label: string; desc: string; match: (t: TaskDef) => boolean }[] = [
	{ key: "quixbugs", label: "QuixBugs", desc: "Single-line Python bug fixes", match: (t) => t.name.startsWith("quixbugs-") },
	{ key: "hard", label: "Hard", desc: "Multi-step coding challenges", match: (t) => t.name.startsWith("hard-") },
	{ key: "long-context", label: "Long Context", desc: "Large codebase / multi-file tasks", match: (t) => t.name.startsWith("long-context-") },
	{ key: "codegen", label: "Code Generation", desc: "Build programs from a spec", match: (t) => t.name.startsWith("codegen-") },
	{ key: "perf", label: "Performance", desc: "Optimize slow code", match: (t) => t.name.startsWith("perf-") },
	{ key: "security", label: "Security", desc: "Find and fix vulnerabilities", match: (t) => t.name.startsWith("security-") },
];
