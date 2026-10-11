/** Task definition loaded from JSON in tasks/. */
export interface TaskDef {
	name: string;
	description: string;
	dataset?: string;
	instruction: string;
	setup_files: Record<string, string>;
	verify: string;
	timeout: number;
	tags: string[];
}

export interface ResolvedTasks {
	tasks: TaskDef[],
	runLabel: string
}

export type Status = "pass" | "fail" | "error" | "timeout";

export interface VerificationResult {
	status: Status;
	verify_output: string;
}

/** Result of running a single benchmark task. */
export interface TaskResult extends VerificationResult{
	task: string;
	duration_ms: number;
	model: string;
	timestamp: string;
}

/** Execute a single benchmark task end-to-end. */
export type RunTask = (
	task: TaskDef,
	model: string,
) => Promise<TaskResult>

export interface TaskResultsStats {
	total: number,
	passed: number,
	failed: number
}

export interface TaskResults {
	results: TaskResult[],
	taskResultsStats: TaskResultsStats
}

/** UI adapter — mirrors ctx.ui.notify / setStatus semantics, no ExtensionAPI. */
export type UIAdapter = {
	notify(msg: string, level?: "info" | "error" | "warning"): void;
	setStatus(key: string, msg?: string): void;
};

export interface SpawnWithExitCode {
	code: number | null,
	signal: NodeJS.Signals | null,
	stdout: string,
	stderr: string,
}