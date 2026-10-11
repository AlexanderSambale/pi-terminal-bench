# Functionality Required for Rewrite

## Core: Benchmark Execution Lifecycle

The TypeScript `terminalBench` function implements a complete benchmark runner with these capabilities that must be preserved in a rewrite:

### 1. Task Management & Categorization

- Load task definitions from JSON files (setup_files, instruction, verify script, timeout, tags)
- List/filter tasks by category (QuixBugs, Hard, Long Context, CodeGen, Perf, Security) using prefix-based matching (`name.startsWith(...)`)
- Support running individual tasks, categories, or all tasks in a batch

### 2. Workspace Management

- Create temp workspaces with `pi-bench.*` prefix via `mktemp -d -t pi-bench.XXXXXX`
- Write setup files (from `setup_files` map) into the workspace
- Fingerprint setup files (MD5 hashes) to detect if the agent modified them

### 3. Process Tracking & Cleanup

- Track active workdirs in memory + persisted registry file (`active-workdirs.txt`)
- Kill child processes by matching argv/cwd patterns (not just PIDs), using `pgrep -f <dir>` and `lsof -d cwd -Fpn`
- Walk process descendants hierarchically (reparenting-safe) before killing
- Remove stale workdirs on cleanup/timeout/shutdown
- Sweep for stray processes matching `pi-bench.*` prefix on session end

### 4. Verification

- Run the task's verify script with `$BENCH_WORK_DIR` substituted, timeout 30s
- Capture stdout/stderr; exit code determines pass/fail status

### 5. Result Recording & Reporting

- Persist run results to JSON with: model, filter, timestamp, summary (total/passed/failed), individual task results (status, duration, verify_output)
- Display progress/scoreboard during batch runs
- Show verification output for failed tasks

### 6. UI Communication

- Notify user of task names, descriptions, status via `ctx.ui.notify`
- Set status bar messages for progress tracking
