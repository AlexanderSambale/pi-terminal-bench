#!/usr/bin/env node
/** Standalone CLI entry — replaces /bench-* dispatch when running outside pi REPL. */

import * as process from "node:process";
import { terminalBench } from "./benchmark";
import { makeCLIAdapter } from "./benchmark/ui";

const args = process.argv.slice(2).join(" ");
terminalBench(args, makeCLIAdapter());
