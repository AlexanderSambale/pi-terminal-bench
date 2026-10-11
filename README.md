# pi-terminal-bench

68 coding tasks for [pi](https://shittycodingagent.ai). No Docker, no frameworks, no API keys — just the pi CLI and Python 3.10+. You watch the agent work in real time.

## Install

```bash
npm install
```

## Requirements

- **pi** CLI
- **Python 3.10+** and **bash**
- **bun**
- *Optional:* `numpy`, `pandas`, `sympy`, `word2number` — a handful of ported Terminal-Bench tasks use these. The verify scripts auto-install on demand, so you usually don't have to care.

Runs against any model pi has configured — local (OMLX, LM Studio, Ollama) or remote (Anthropic, OpenAI). Defaults to your active model; append `provider/model` to any command to override.

## Commands

| Command | What it does |
| --- | --- |
| list [filter]` | List tasks. `filter` matches name, category, or tag |
| `run <task\|category\|all>` | Run one task, a whole category, or everything |
| `results [N]` | Recent runs. With `N`, per-task detail for run N |
| `doctor` | Check prerequisites |
| `cleanup` | Kill stray benchmark processes |

## Tasks — 68 across 11 categories

| Category | Count | Command | What it tests |
| --- | --- | --- | --- |
| QuixBugs | 40 | `run quixbugs` | Single-line Python bug fixes ([upstream](https://github.com/jkoppel/QuixBugs)) |
| Terminal-Bench ports | 8 | `run terminal-bench` | Tasks ported from [Terminal-Bench](https://github.com/laude-institute/terminal-bench), Docker-free |
| Hard | 7 | `run hard` | Multi-step algorithms, parsing, concurrency |
| Long Context | 6 | `run long-context` | Multi-file refactors, test generation, API migrations |
| Code Generation | 3 | `run codegen` | Build CLIs, REST APIs, state machines from a spec |
| Performance | 2 | `run perf` | Optimize O(n²) code |
| Security | 2 | `run security` | Fix SQL injection and path traversal |
| File Operations | 2 | `run file-operations` | Read/write/transform files |
| Mathematics | 2 | `run math` | Symbolic math, arithmetic puzzles |
| Games | 2 | `run games` | Game-logic and puzzle solvers |
| Data Science | 1 | `run data-science` | pandas ETL |
| Debugging | 1 | `run debugging` | Fix a diverging ML training loop |

Run `list <category>` to see individual task names.

## Example

```bash
npm run bench run quixbugs-python-bitcount                         # one task
npm run bench run hard                                             # one category
npm run bench run quixbugs anthropic/claude-sonnet-4-20250514      # override model
npm run bench run all                                              # everything
npm run bench results                                              # past runs
npm run bench results 1                                            # per-task detail
```

Results are written as JSON to `./state/results/`.

## Adding tasks

Drop a JSON file in `tasks/`:

```json
{
  "name": "my-task",
  "description": "What this tests",
  "instruction": "What the agent sees",
  "setup_files": { "buggy.py": "...", "test.py": "..." },
  "verify": "cd $BENCH_WORK_DIR && python3 test.py",
  "timeout": 180000,
  "tags": ["custom"]
}
```

`$BENCH_WORK_DIR` is replaced with the task's workspace. `verify` passes iff exit code is 0. Keep verifies fast (< 30s), deterministic, and scoped to the workspace.

## Safety

Every task runs in an isolated temp directory with a `pi-bench.` prefix (`$TMPDIR/pi-bench.XXXXXX`). After each task — pass, fail, or abort — the runner kills lingering processes (including descendants reparented to launchd) and removes the workspace. Active workspaces are persisted to `./state/active-workdirs.txt`, so `cleanup` can sweep orphans from crashed sessions.

**Every cleanup path is scoped strictly to paths matching `pi-bench.`** — Homebrew, Xcode, git, and any other tool's temp files are untouchable.

## Timeouts

Each task has a `timeout` (default 180s; harder tasks use 240s or 360s). If a command hangs, the agent gets a 2× extended window to recover with a steer message explaining the timeout. If the agent makes no file changes, the task is recorded as FAIL — never a false PASS.

## Debugging

```bash
bun --inspect-brk=127.0.0.1:6499 src/cli.ts list
```

### Run

```bash
bun src/cli.ts
bun src/cli.ts list
bun src/cli.ts run
bun src/cli.ts results
bun src/cli.ts doctor
bun src/cli.ts cleanup
```

## Contributing

PRs welcome. Terminal-Bench has 241 Docker-based tasks; we've ported a subset that runs without Docker and will expand over time.
