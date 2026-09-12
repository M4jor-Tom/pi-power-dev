import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * pi has no permission system, so the two `permissions.deny` entries the
 * Claude profile carried are reimplemented here. Keep this list short: it is
 * a guard against an irreversible mistake, not an allowlist.
 */
const DENIED: Array<{ pattern: RegExp; what: string }> = [
	{ pattern: /(^|[;&|]\s*)terraform\s+destroy\b/, what: "terraform destroy" },
	{ pattern: /(^|[;&|]\s*)tofu\s+destroy\b/, what: "tofu destroy" },
];

/** Returns a human-readable reason when `command` must not run. */
export function denyReason(command: string): string | undefined {
	const hit = DENIED.find(({ pattern }) => pattern.test(command));
	return hit ? `${hit.what} is denied by this pi profile. Run it yourself if you mean it.` : undefined;
}

export default function guard(pi: ExtensionAPI): void {
	pi.on("tool_call", (event) => {
		if (event.toolName !== "bash") return;
		const reason = denyReason((event.input as { command: string }).command);
		if (reason) return { block: true, reason };
	});
}
