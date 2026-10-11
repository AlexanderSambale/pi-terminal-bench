import { mkdirSync, writeFileSync } from "node:fs";
import { spawn, SpawnOptionsWithoutStdio } from "node:child_process";
import type { SpawnWithExitCode, TaskDef, TaskResult, VerificationResult } from "./types.ts";
import { WORKDIR_PREFIX } from "./constants.ts";
import { isOwnedWorkDir, killProcessesInDir, cleanupWorkDir, registerWorkDir } from "./cleanup.ts";
import path from "node:path";

async function createTmpWorkspace(start: number, timestamp: string, taskName: string, model: string): Promise<TaskResult | string> {
	let workDir = "";
	try {
		const result = await spawnAsync("bash", ["-lc", `mktemp -d -t ${WORKDIR_PREFIX}.XXXXXX`], { stdio: "pipe" });
		workDir = String(result.stdout).trim();
	} catch (_err) {
		return { task: taskName, status: "error", duration_ms: Date.now() - start, verify_output: "Failed to create temp directory", model, timestamp };
	}

	if (!workDir || !isOwnedWorkDir(workDir)) {
		return { task: taskName, status: "error", duration_ms: Date.now() - start, verify_output: "Failed to create temp directory", model, timestamp };
	}
	return workDir
}

function writeSetupFiles(task: TaskDef, workDir: string) {
	for (const [filename, content] of Object.entries(task.setup_files)) {
		const filePath = path.join(workDir, filename);
		mkdirSync(path.dirname(filePath), { recursive: true });
		writeFileSync(filePath, content);
	}
}

async function spawnAsync(command: string, args?: readonly string[] | undefined, options?: SpawnOptionsWithoutStdio | undefined): Promise<SpawnWithExitCode> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', data => {
      stdout += data.toString();
    });

    child.stderr.on('data', data => {
      stderr += data.toString();
    });

    child.on('error', reject);

    child.on('close', (code, signal) => {
      resolve({
        code,
        signal,
        stdout,
        stderr,
      });
    });
  });
}

async function runVerification(task: TaskDef, workDir: string): Promise<VerificationResult> {
	// Step 3: Run verification. Even if the agent ran, we give credit if tests pass.
	const verifyCmd = task.verify.replace(/\$BENCH_WORK_DIR/g, workDir);
	const verifyResult = await spawnAsync("bash", ["-lc", verifyCmd], { timeout: 30000 });
	const verify_output = `${verifyResult.stdout}\n${verifyResult.stderr}`.trim();
	return { status: verifyResult.code === 0 ? "pass" : "fail", verify_output };
}

async function runPi(task: TaskDef, workDir: string, model: string, start: number, timestamp: string) {
	const instruction = [
		`[Benchmark Task: ${task.name}]`,
		"",
		task.instruction,
		"",
		`All files are in: ${workDir}`,
		`Work only within that directory. Do not modify files outside it.`,
	].join("\n");

	const taskTimeout = task.timeout || 180000; // default 3 minutes

	return await new Promise((resolve, reject) => {
		const child = spawn(
			"bash",
			["-lc", `pi --model "${model}" --print "${instruction}"`],
			{
				stdio: ["ignore", "pipe", "pipe"],
			}
		);

		let stdout = "";
		let stderr = "";

		child.stdout.on("data", (data) => {
			stdout += data;
		});

		child.stderr.on("data", (data) => {
			stderr += data;
		});

		const timeout = setTimeout(() => {
			child.kill("SIGTERM");
			reject(new Error("Execution timed out"));
		}, taskTimeout);

		child.on("error", (error) => {
			clearTimeout(timeout);
			reject(error);
		});

		child.on("close", async (code) => {
			clearTimeout(timeout);

			if (code === 0) {
				resolve({
					stdout,
					stderr,
					code,
				});
			} else {
				return resolve({
					task: task.name,
					status: "timeout",
					duration_ms: Date.now() - start,
					verify_output: `Task timed out after ${Math.round(taskTimeout / 1000)}s`,
					model,
					timestamp,
				});
			}
		});
	});
}

/** Run a single benchmark task end-to-end using pure Node.js — no ExtensionAPI. */
export async function runSingleTask(
	task: TaskDef,
	model: string,
): Promise<TaskResult> {
	const start = Date.now();
	const timestamp = new Date().toISOString();

	const resultTmpWorkspace = await createTmpWorkspace(start, timestamp, task.name, model);
	if(typeof resultTmpWorkspace !== "string") {
		return resultTmpWorkspace;
	}
	const workDir = resultTmpWorkspace;

	registerWorkDir(workDir);

	writeSetupFiles(task, workDir);
	await runPi(task, workDir, model, start, timestamp);
	const { status , verify_output } = await runVerification(task, workDir);

	killProcessesInDir(workDir);
	cleanupWorkDir(workDir);

	return { task: task.name, status, duration_ms: Date.now() - start, verify_output: verify_output.slice(0, 500), model, timestamp };
}


