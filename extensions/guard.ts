import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * pi has no permission system, so the two `permissions.deny` entries the
 * Claude profile carried are reimplemented here. Keep this list short: it is
 * a guard against an irreversible mistake, not an allowlist.
 *
 * ponytail: string matching, not shell parsing. Indirection still defeats it
 * (`TF=terraform; $TF destroy`, aliases, `bash -c "$(printf ...)"`). This
 * stops a fat-finger and a confidently-wrong agent, not a determined bypass —
 * for that, use credentials that cannot destroy.
 *
 * The quote-stripping in normalize() means a command that merely mentions the
 * phrase is blocked too — `git commit -m "revert the terraform destroy
 * incident"` does not run. That is deliberate: a false block costs one
 * rephrase, a false pass costs infrastructure.
 */
const DENIED: Array<{ pattern: RegExp; what: string }> = [
	{ pattern: /(^|[\s;&|(`])terraform destroy(?=[\s;&|)`]|$)/, what: "terraform destroy" },
	{ pattern: /(^|[\s;&|(`])tofu destroy(?=[\s;&|)`]|$)/, what: "tofu destroy" },
];

/**
 * Flatten the shapes a shell treats as identical but a naive regex does not:
 * quotes around a word, and any run of whitespace — newlines included, which
 * is how multi-line tool calls arrive.
 */
function normalize(command: string): string {
	return command.replace(/["']/g, "").replace(/\s+/g, " ");
}

/** Returns a human-readable reason when `command` must not run. */
export function denyReason(command: string): string | undefined {
	const normalized = normalize(command);
	const hit = DENIED.find(({ pattern }) => pattern.test(normalized));
	return hit ? `${hit.what} is denied by this pi profile. Run it yourself if you mean it.` : undefined;
}

export default function guard(pi: ExtensionAPI): void {
	pi.on("tool_call", (event) => {
		if (event.toolName !== "bash") return;
		const reason = denyReason((event.input as { command: string }).command);
		if (reason) return { block: true, reason };
	});
}
