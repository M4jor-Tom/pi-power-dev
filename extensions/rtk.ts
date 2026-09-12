import { execFileSync } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Ask rtk how it would rewrite `command`.
 *
 * rtk has hook modes for claude, cursor, gemini, copilot and droid but none
 * for pi, so we speak the Claude PreToolUse shape: it is the one rtk treats
 * as canonical, and the reply carries the rewritten command verbatim.
 *
 * Returns undefined when rtk has no rewrite, when rtk is not installed, or
 * when it answers with something unexpected. Every one of those means "run
 * the command as the model wrote it".
 */
export function rtkRewrite(command: string): string | undefined {
	let stdout: string;
	try {
		// The 5s timeout blocks the event loop for its duration; ExtensionHandler
		// permits a Promise return if that synchronous wait ever becomes a problem.
		stdout = execFileSync("rtk", ["hook", "claude"], {
			input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
			encoding: "utf-8",
			timeout: 5000,
			stdio: ["pipe", "pipe", "ignore"],
		});
	} catch {
		return undefined;
	}
	if (!stdout.trim()) return undefined;
	try {
		const rewritten = JSON.parse(stdout)?.hookSpecificOutput?.updatedInput?.command;
		// Defence against future contract change: rtk currently returns empty stdout when it
		// has no rewrite, but guard against an identical-command reply.
		return typeof rewritten === "string" && rewritten !== command ? rewritten : undefined;
	} catch {
		return undefined;
	}
}

export default function rtk(pi: ExtensionAPI): void {
	pi.on("tool_call", (event) => {
		if (event.toolName !== "bash") return;
		const input = event.input as { command: string };
		const rewritten = rtkRewrite(input.command);
		if (rewritten) input.command = rewritten;
	});
}
