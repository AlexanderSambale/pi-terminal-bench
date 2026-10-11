/** Lightweight notify/status-bar stand-in — mirrors the ExtensionAPI side's semantics. */
import process from "node:process";
import type { UIAdapter } from "./types.ts";

const RESET = '\x1b[0m';
const DIM   = '\x1b[2m';
const RED   = '\x1b[31m';
const GRN   = '\x1b[32m';
const YEL   = '\x1b[33m';
const CYN   = '\x1b[36m';

function fmt(level: "info" | "error" | "warning", msg: string): string {
	switch (level) {
		case "error":   return `${RED}[error]${RESET} ${msg}`;
		case "warning": return `${YEL}[warn ]${RESET} ${msg}`;
		default:       return `${CYN}[info ]${RESET} ${msg}`;
	}
}

/** UIAdapter wired to real process.stdout/stderr with ANSI coloring. */
export function makeCLIAdapter(): UIAdapter {
	return {
		notify(msg, level = "info") {
			if (level === "error") process.stderr.write(fmt(level, msg) + '\n');
			else                   console.log(fmt(level, msg));
		},
		setStatus(_key, msg?) {
			if (msg !== undefined) console.log(`${DIM}[status]${RESET} ${msg}`);
		},
	};
}

/** Light-weight stand-in for ExtensionAPI — no colors. */
export function makeUIAdapter(): UIAdapter {
	return {
		notify: (msg, _level?) => console.log(`[bench] ${msg}`),
		setStatus: (_key, msg?) => { if (msg !== undefined) console.log(`[status] ${msg}`); },
	};
}
