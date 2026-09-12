# pi-power-dev

A [pi](https://pi.dev) agent directory: general-purpose coding profile,
ported from `M4jor-Tom/claude-power-dev`.

## Use it

Without Nix — this repo *is* the agent dir:

```bash
git clone https://github.com/M4jor-Tom/pi-power-dev.git ~/.pi-power-dev
PI_CODING_AGENT_DIR=~/.pi-power-dev pi
```

With Nix, which also supplies every CLI the skills shell out to:

```bash
nix run github:M4jor-Tom/pi-power-dev.app
```

`PI_CODING_AGENT_DIR` replaces pi's `agent` subdirectory, so this repo's
`settings.json` is what `~/.pi/agent/settings.json` would normally be.

## Layout

| Path | Role |
|---|---|
| `AGENTS.md` | Global memory, loaded at every session start |
| `settings.json` | pi settings, and the pinned `packages[]` manifest |
| `mcp.json` | MCP servers, read by `pi-mcp-adapter` |
| `skills/` | Locally authored skills |
| `prompts/` | Slash commands |
| `extensions/` | TypeScript extensions (pi's replacement for hooks) |
| `agents/` | Subagent definitions, read by `pi-subagents` |
| `tests/` | `node --test` unit tests for the extensions |
| `scripts/check.sh` | Integrity check, also run in CI |

Auth, sessions and memory are per-profile: because `PI_CODING_AGENT_DIR`
points here, `auth.json`, `sessions/` and `pi-hermes-memory/` all land in
this directory and are gitignored. Nothing is shared with `~/.pi` or with
`pi-game-dev`.

## Updating pinned packages

Refs in `packages[]` are pinned. `pi update --extensions` reconciles clones
to the configured ref; moving to a newer ref means editing `settings.json`
(or `pi install git:host/user/repo@new-ref`) and committing.

## Not ported from Claude Code

pi has no equivalent, by design, for these — each was dropped deliberately:

| Claude Code | Why it is gone |
|---|---|
| `permissions.allow` (41 entries) | pi has no permission prompts. Tool scoping is `defaultTools` / `--tools`. |
| `statusLine: bunx ccstatusline` | pi's footer already shows cwd, session, tokens, cache, cost, context and model. |
| `worktree`, `enableWorkflows`, `sandbox` | No analogue. |
| `cleanupPeriodDays`, `spinnerTipsEnabled` | No analogue. |
| `skipDangerousModePermissionPrompt`, `skipWorkflowUsageWarning` | Nothing to skip — there is no prompt. |
| `github` MCP | Replaced by the `gh` CLI, which `AGENTS.md` already mandates. |
| `playwright` MCP | Replaced by the `playwright-cli` skill. |

## Known version gap

`skills/graphify/.graphify_version` pins graphify 0.8.30; nixpkgs ships
0.4.23. The app also ships `uv`, so the skill's own
`uv tool install --upgrade graphifyy` path can take over.
