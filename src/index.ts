// Re-export the refactored benchmark modules — no ExtensionAPI dependency here.

export { formatCategorySummary } from "./benchmark/commands";
export type { TaskDef, TaskResult, UIAdapter } from "./benchmark/types";
export { makeUIAdapter } from "./benchmark/ui";
export { runSingleTask } from "./benchmark/runSingleTask";
export { isOwnedWorkDir, killProcessesInDir, cleanupWorkDir, readRegistry, sweepWorkdir } from "./benchmark/cleanup";
export { loadTask, listTasks } from "./benchmark/tasks";
