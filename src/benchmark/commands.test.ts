import { describe, expect, it } from "vitest";
import { parseArgs } from "./commands.js";

describe("parseArgs happy path", () => {
	it("returns empty result for empty input", () => {
		expect(parseArgs("")).toEqual({ targets: [], requestedModel: "" });
	});

	it("returns single target with empty model", () => {
		expect(parseArgs("lint")).toEqual({ targets: ["lint"], requestedModel: "" });
	});

	it("returns model-only with empty targets", () => {
		expect(parseArgs("--model /models/qwen")).toEqual({ targets: [], requestedModel: "/models/qwen" });
	});

	it("parses mixed model + multiple targets in order", () => {
		expect(parseArgs("--model /models/claude foo bar")).toEqual({
			targets: ["foo", "bar"],
			requestedModel: "/models/claude",
		});
	});

	it("multiple targets in order + parses mixed model", () => {
		expect(parseArgs("--model /models/claude foo bar")).toEqual({
			targets: ["foo", "bar"],
			requestedModel: "/models/claude",
		});
	});
});

describe("parseArgs edge cases", () => {
	it("treats whitespace-only as empty", () => {
		expect(parseArgs("   ")).toEqual({ targets: [], requestedModel: "" });
	});
});
