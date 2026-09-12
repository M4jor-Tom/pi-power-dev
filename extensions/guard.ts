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
 *
 * The table also matches an option run between the tool and its subcommand
 * (`terraform -chdir=infra destroy`) and `apply -destroy`, terraform's
 * documented equivalent of `destroy`.
 */
const SEP_BEFORE = String.raw`(^|[\s;&|(\`])`;
const SEP_AFTER = String.raw`(?=[\s;&|)\`]|$)`;
const TOOL = String.raw`(?:terraform|tofu)`;

const DENIED: Array<{ pattern: RegExp; what: string }> = [
	{ pattern: new RegExp(`${SEP_BEFORE}${TOOL}(?: -\\S+)* destroy${SEP_AFTER}`), what: "destroy" },
	{ pattern: new RegExp(`${SEP_BEFORE}${TOOL}(?: -\\S+)* apply(?: [^\\s;&|]+)* -destroy\\b`), what: "apply -destroy" },
];

/**
 * Flatten the shapes a shell treats as identical but a naive regex does not:
 * quotes around a word, backslash line-continuations, and any run of
 * whitespace — newlines included, which is how multi-line tool calls arrive.
 */
function normalize(command: string): string {
	return command.replace(/["'\\]/g, "").replace(/\s+/g, " ");
}

/** Returns a human-readable reason when `command` must not run. */
export function denyReason(command: string): string | undefined {
	const normalized = normalize(command);
	for (const { pattern, what } of DENIED) {
		const match = pattern.exec(normalized);
		if (!match) continue;
		// TOOL is an alternation, so which binary matched has to be read off
		// the match itself rather than baked into a static label.
		const tool = new RegExp(TOOL).exec(match[0])?.[0] ?? "terraform";
		return `${tool} ${what} is denied by this pi profile. Run it yourself if you mean it.`;
	}
	return undefined;
}

// rtk.ts also mutates event.input.command on tool_call, and pi does not
// guarantee handler order across extensions/*.ts. This is currently safe
// only because rtk merely prefixes commands (`rtk terraform destroy` still
// matches the patterns above), so it does not matter which handler runs first.
export default function guard(pi: ExtensionAPI): void {
	pi.on("tool_call", (event) => {
		if (event.toolName !== "bash") return;
		const reason = denyReason((event.input as { command: string }).command);
		if (reason) return { block: true, reason };
	});
}
