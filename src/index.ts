// Re-export the refactored benchmark modules — no ExtensionAPI dependency here.

export { formatCategorySummary } from "./benchmark/commands.ts";
export type { TaskDef, TaskResult, UIAdapter } from "./benchmark/types.ts";
export { makeUIAdapter } from "./benchmark/ui.ts";
export { runSingleTask } from "./benchmark/runSingleTask.ts";
export { isOwnedWorkDir, killProcessesInDir, cleanupWorkDir, readRegistry, sweepWorkdir } from "./benchmark/cleanup.ts";
export { loadTask, listTasks } from "./benchmark/tasks.ts";
