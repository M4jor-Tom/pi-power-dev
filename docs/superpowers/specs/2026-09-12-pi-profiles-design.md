# pi.dev profiles: `pi-power-dev` and `pi-game-dev`

Date: 2026-09-12
Status: Approved

## Goal

Reproduce the two existing Claude Code profiles — `~/.claude-power-dev` and
`~/.claude-game-dev` — as pi.dev-shaped configuration repos, plus two Nix apps
that run pi against them.

Four repositories, all under `github.com/M4jor-Tom`:

| Repo | Role | Runtime location |
|---|---|---|
| `pi-power-dev` | pi agent dir, general-purpose profile | cloned to `~/.pi-power-dev` |
| `pi-game-dev` | pi agent dir, ontology-first gamedev profile | cloned to `~/.pi-game-dev` |
| `pi-power-dev.app` | Nix flake: clone + deps + `exec pi` | `nix run` |
| `pi-game-dev.app` | Nix flake: clone + deps + `exec pi` | `nix run` |

Authoring clones live at `~/repos/<name>`. The `.app` flakes are a
convenience only: a config repo is fully usable standalone with
`PI_CODING_AGENT_DIR=~/.pi-power-dev pi`.

## Background: how pi differs from Claude Code

Verified against `pi-coding-agent` 0.83.0 (nixpkgs) and `earendil-works/pi`
`v0.85.1`. These facts constrain every decision below.

- **Config dir.** `PI_CODING_AGENT_DIR` replaces the `agent` subdirectory
  itself, not the `.pi` root. Setting it to `~/.pi-power-dev` yields
  `~/.pi-power-dev/settings.json`, with no intermediate `agent/`.
- **Global memory** is `~/.pi/agent/AGENTS.md` (`CLAUDE.md` also works, lower
  priority). **`@`-imports are not supported** — `loadContextFileFromDir` is a
  bare `readFileSync` with no expansion pass.
- **Skills** implement the same Agent Skills standard, so Claude Code skills
  load unchanged. Discovery **recurses to unlimited depth**, stopping at the
  first directory containing `SKILL.md`.
- **Prompt templates** (`prompts/*.md`) are pi's slash commands. Discovery is
  **non-recursive**.
- **Extensions** are TypeScript/JavaScript modules loaded via jiti. They
  replace Claude Code hooks: `SessionStart`→`session_start`,
  `PreToolUse`→`tool_call` (can block, and `event.input` is mutable),
  `PostToolUse`→`tool_result`, `UserPromptSubmit`→`input`,
  `Stop`→`agent_end`. There is **no `hooks` key in settings.json**; a `hooks/`
  directory is deprecated and migrated away.
- **`packages[]` in `settings.json` is the manifest.** No separate lockfile
  exists; pinning is inline in the source string (`git:host/user/repo@sha`,
  `npm:pkg@1.2.3`). pi installs missing packages on startup, cloning into
  `<agent-dir>/git/<host>/<path>` and `<agent-dir>/npm/`.
- **pi writes back into `settings.json`** — `SettingsManager.save()` fires on
  theme change, `/model` Ctrl+S, `/thinking` Ctrl+S, `lastChangelogVersion`
  and ~19 other setters, doing a field-level merge under a lock file.
- **No MCP, no subagents, no permission prompts, no plan mode, no todos** in
  core, by explicit design.
- **No statusline setting.** The footer is an extension API
  (`ctx.ui.setStatus`, `ctx.ui.setFooter`).
- **Auth** resolution is `--api-key` > `auth.json` > env var > `models.json`.
  `auth.json` values support `"$VAR"` and `"!command"`, so a repo can ship
  zero secrets.

## Architecture

### Repository shape

A `.pi-*` repo *is* a pi agent dir. Tracked content:

```
AGENTS.md          global memory (Claude's CLAUDE.md + its @-imports, inlined)
settings.json      pi settings, incl. the pinned packages[] manifest
mcp.json           MCP servers, read by pi-mcp-adapter
skills/            locally authored skills
prompts/           slash commands
extensions/        TypeScript extensions
agents/            subagent definitions (consumed by extensions/subagent)
docs/              ADRs and specs
scripts/check.sh   integrity check
.github/           CI + Dependabot
README.md
.gitignore
```

Ignored — machine-local state. This is what "each profile holds its own auth
and memory" means in practice: because `PI_CODING_AGENT_DIR` is per-profile,
credentials, sessions and memory land inside that profile's directory and are
never shared with `~/.pi` or the other profile.

```
auth.json  models-store.json  trust.json  *.bak
sessions/  bin/  npm/  git/  node_modules/  experimental/
pi-debug.log
pi-hermes-memory/  projects-memory/  hermes-memory-config.json
```

`models.json` (custom provider definitions) would be tracked, but neither
profile needs one: both use built-in providers.

### Why a clone and not a Nix store symlink

`settings.json` must be writable, because pi merges its own fields into it.
The runtime directory is therefore a real git working tree. The `.app` flake
clones it; it never links it out of the store.

### The `.app` flake

Two files, mirroring the existing `~/repos/claude-code-nix` layout:
`flake.nix` (inputs `nixpkgs` + `systems`, `eachSystem`, an overlay, and
`packages`/`apps`/`devShells` outputs) and `package.nix` (the wrapper
derivation, `pkgs.writeShellApplication`).

Wrapper behaviour:

```sh
DIR="${PI_POWER_DEV_DIR:-$HOME/.pi-power-dev}"
if [ ! -e "$DIR" ]; then
  git clone https://github.com/M4jor-Tom/pi-power-dev.git "$DIR"
elif [ -z "$(git -C "$DIR" status --porcelain)" ]; then
  git -C "$DIR" pull --ff-only || true
fi
export PI_CODING_AGENT_DIR="$DIR"
exec pi "$@"
```

A dirty tree skips the pull, so local edits are never clobbered. A failed
pull is non-fatal — offline use still starts. `PI_POWER_DEV_DIR` /
`PI_GAME_DEV_DIR` override the location. All flake references use
`git+https://`, not `git+ssh://`.

`nixpkgs#pi-coding-agent` (0.85.1 on unstable, `mainProgram = "pi"`) is used
as-is; its wrapper already sets `PI_SKIP_VERSION_CHECK=1`, `PI_TELEMETRY=0`
and supplies `rg`/`fd`.

Runtime dependencies, all from nixpkgs, identical for both apps because both
profiles carry the same skills and extensions:

```
pi-coding-agent git gh glab nodejs bun ripgrep fd jq yq-go
uv python3 rtk graphify markitdown pandoc poppler-utils yt-dlp
```

Engine toolchains for gamedev stay in each game repo's own devShell; the
router skill selects an engine per project, so shipping all of them in the
agent wrapper would be wrong.

**Known version gap:** nixpkgs `graphify` is 0.4.23 while
`skills/graphify/.graphify_version` pins 0.8.30. Shipping `uv` alongside lets
the skill's own `uv tool install --upgrade graphifyy` path take over when the
pinned version matters. Recorded in the app README.

## Artifact port

`packages[]` entries are pinned; pi clones them into the gitignored
`git/` and `npm/` subdirectories. No git submodules and no nested git
repositories anywhere in these repos.

### Shared by both profiles

| Claude artifact | pi approach |
|---|---|
| `CLAUDE.md` + `@RTK.md` + `@conventional-commits.md` | One `AGENTS.md`, contents inlined. pi has no `@`-imports. Section structure preserved. |
| `settings.json` `enabledPlugins` | `packages[]` (below) plus `skills[]`/`prompts[]` paths. |
| `permissions.allow` (41 entries) | Dropped. pi has no permission prompts. `defaultTools` scopes tools if ever needed. |
| `permissions.deny` (`terraform destroy`, `tofu destroy`) | `extensions/guard.ts` — a `tool_call` handler returning `{ block: true, reason }`. |
| `agentPushNotifEnabled` | No analogue. Dropped. |
| **superpowers** | `git:github.com/obra/superpowers@b36e0829c6d0140e93cfef2ca599b1b07d4a7797`. Already a pi package: `keywords: ["pi-package"]`, `pi.extensions: ["./.pi/extensions/superpowers.ts"]`, `pi.skills: ["./skills"]`. 14 skills and the session bootstrap load natively. |
| **ponytail** | `git:github.com/DietrichGebert/ponytail@v4.9.0`. Already a pi package: `pi.extensions: ["./pi-extension/index.js"]`, `pi.skills: ["./skills"]`. The extension wraps the same `hooks/ponytail-config.js` runtime the Claude hooks use, so mode tracking, `.ponytail-active` and subagent re-injection all carry over. |
| **claude-mem** | `npm:pi-hermes-memory`. Persistent memory, session search, SQLite FTS5. Stores under `<agent-dir>/pi-hermes-memory/` and `<agent-dir>/projects-memory/`, so memory is per-profile. Registers `memory_add`, `memory_search`, `session_search`, `skill_manage` and ten `/memory-*` commands. |
| **understand-anything** | `git:github.com/Egonex-AI/Understand-Anything@6ae71878beb50226a1e4b7e2f52ac6468c86f74b`, filtered to `understand-anything-plugin/skills`. Its ten `agents/*.md` use the same frontmatter the subagent extension expects and are copied into `agents/`. |
| **ui-ux-pro-max** | `git:github.com/nextlevelbuilder/ui-ux-pro-max-skill@1307d97a72e6c1cda572cb65471ae5ce82995218`, filtered to `.claude/skills`. |
| **frontend-design**, **claude-md-management** | `git:github.com/anthropics/claude-plugins-official@ed404106fcd80ba98ecb7c851e531dcb626d13b7`, filtered to `plugins/frontend-design/skills` and `plugins/claude-md-management/skills`. The plugin's `revise-claude-md` command becomes `prompts/revise-agents-md.md`. |
| **github** MCP | Dropped in favour of the `gh` CLI, which `AGENTS.md` already mandates. This also removes the `GITHUB_PERSONAL_ACCESS_TOKEN` failure the Claude profiles have today. |
| **playwright** MCP | Dropped; the locally authored `playwright-cli` skill already covers browser work. It self-installs `@playwright/cli` via npm exactly as it does under Claude today, so the app ships no `playwright-driver` — that would fight the skill over browser paths. |
| **context7** MCP | `npm:pi-mcp-adapter` plus a tracked `mcp.json`. The adapter exposes one lazy proxy tool rather than N server tools. |
| subagents (`Task` tool) | `npm:pi-subagents@0.67.0`. A pi package (`keywords: ["pi-package"]`) by the `pi-mcp-adapter` author. Reads `<agent-dir>/agents/*.md` — verified in source: `buildAgentDiscoverySources` selects `join(getAgentDir(), "agents")` whenever `PI_CODING_AGENT_DIR` is set, which is always our case. Same `name`/`description`/`tools`/`model` frontmatter as Claude Code agents. Chosen over vendoring pi's 1195-line `examples/extensions/subagent/`. |
| `statusLine: bunx ccstatusline@latest` | Dropped. pi's built-in footer already shows cwd, session name, token and cache usage, cost, context usage and model. |
| `effortLevel: "xhigh"` | `defaultThinkingLevel: "xhigh"` |
| `theme: "auto"` | `theme` — pi detects terminal background on first run. |
| `language: "English"` | A line in `AGENTS.md`. |
| `worktree`, `enableWorkflows`, `sandbox`, `cleanupPeriodDays`, `spinnerTipsEnabled`, `skipDangerousModePermissionPrompt`, `skipWorkflowUsageWarning` | No pi analogue. Dropped; each listed in the repo README with the reason. |
| `rules/context7.md` (power-dev today) | `skills/context7/SKILL.md`. In Claude this loads by directory convention on every session; as a pi skill it is progressive-disclosure, which suits a conditional rule better. |
| **`rtk`** (power-dev today) | `extensions/rtk.ts`. `RTK.md` asserts commands are rewritten automatically, but **no such hook has ever been wired** — the NixOS `rtk.enable` flag only installs the binary. A `tool_call` handler mutating `event.input.command` for the bash tool makes the documented behaviour real for the first time. `rtk hook` has `claude`/`cursor`/`gemini`/`copilot`/`droid` modes but no `pi` mode; the extension feeds it the Claude-shaped payload (`{tool_name, tool_input:{command}}`) and applies the returned command. `rtk hook check` provides a dry run. |
| 6 authored skills (power-dev today): `graphify`, `llm-council`, `markitdown`, `playwright-cli`, `prd`, `writing-adrs` | Copied verbatim into both repos. Same Agent Skills format; unknown frontmatter (`trigger:`, `user-invocable:`) is ignored by pi. `graphify` additionally gets `prompts/graphify.md` so `/graphify` works as a real slash command rather than only `/skill:graphify`. |
| `/simplify` + `/ponytail:ponytail-review` end-of-task ritual (power-dev today) | `prompts/simplify.md`; ponytail's own skills provide the review. The ritual stays stated in `AGENTS.md`. |
| `settings.local.json` (`WebFetch(domain:github.com)`) | Dropped with the rest of the permission system. |

Everything above lands in **both** repos. The two profiles differ only by
what `pi-game-dev` adds on top, and by `AGENTS.md`, which keeps each
profile's own policy: `pi-power-dev` carries the general git/CLI/workflow
rules, `pi-game-dev` carries those plus the ontology-first rules.

### `pi-game-dev` only

| Claude artifact | pi approach |
|---|---|
| **69 symlinks** in `skills/` into `vendor/` | **Deleted.** pi's skill discovery recurses, so a single `skills` entry per collection loads all of them. ADR 0002's symlink mechanism becomes unnecessary; a new ADR 0003 records the change. |
| `vendor/awesome-gamedev-agent-skills` submodule | `git:github.com/gamedev-skills/awesome-gamedev-agent-skills@9ca5296b219049c5b68494e1f3c274ead6d727b3`, skills filtered to `skills` and `router`. |
| `vendor/claude-ontology-skill` submodule (branch-pinned fork) | `git:github.com/M4jor-Tom/claude-ontology-skill@13bfe0ce8c46fbd3d77e9faf94ebeb6ba4f5bab3`. Pinned to the commit rather than the branch, since pi pins refs. |
| `skills/game-from-ontology/` | Copied verbatim. Its internal references to `skills/ontology/SKILL.md` and `skills/router/SKILL.md` are rewritten to name the skills rather than hardcode paths, because package skills resolve under `git/`. |
| `skills/ontology-resume-router-slice/` (untracked nested git repo) | Copied into `skills/ontology-resume-router-slice/` as three plain files. Not a package: its `SKILL.md` sits at the repo root, and pi's convention discovery only scans a package's `skills/` directory. Copying is also what removes the nested-repository problem. The frontmatter `name:` typo `onthology-resume-router-slice` is fixed to match the directory. Its per-phase model routing depends on `pi-subagents`. |
| `model: "claude-fable-5-1[1m]"` | `defaultProvider` + `defaultModel`. |
| `extraKnownMarketplaces` | Subsumed by `packages[]`. |
| `scripts/check.sh` | Adapted: assert `settings.json` and `mcp.json` parse, every `skills/*/SKILL.md` has `name` and `description`, and every `prompts/*.md` is non-empty. It can no longer count vendored skills, because those live in the gitignored `git/` tree after pi installs them. |
| `.github/workflows/check.yml`, `.github/dependabot.yml` | Workflow kept, running the adapted `check.sh`. Dependabot's `gitsubmodule` ecosystem no longer applies — pinned refs in `settings.json` are bumped manually or by `pi update --extensions`. |
| `docs/adr/0001`, `0002` | Copied; `0003` added for the symlinks-to-packages change. |
| Used as a game repo's `.claude/` submodule | The profile is global at `~/.pi-game-dev` as specified. The same repo can additionally be cloned as a project's `.pi/` when per-repo scoping is wanted; pi merges project settings over global ones. |

## Settings sketch

Shared by both repos — `pi-game-dev/settings.json` is this plus
`defaultProvider`/`defaultModel` and the three gamedev packages:

```json
{
  "defaultThinkingLevel": "xhigh",
  "defaultProjectTrust": "ask",
  "enableSkillCommands": true,
  "packages": [
    "git:github.com/obra/superpowers@b36e0829c6d0140e93cfef2ca599b1b07d4a7797",
    "git:github.com/DietrichGebert/ponytail@v4.9.0",
    "npm:pi-hermes-memory",
    "npm:pi-mcp-adapter",
    { "source": "git:github.com/anthropics/claude-plugins-official@ed404106fcd80ba98ecb7c851e531dcb626d13b7",
      "skills": ["plugins/frontend-design/skills", "plugins/claude-md-management/skills"],
      "extensions": [], "prompts": [], "themes": [] },
    { "source": "git:github.com/nextlevelbuilder/ui-ux-pro-max-skill@1307d97a72e6c1cda572cb65471ae5ce82995218",
      "skills": [".claude/skills"], "extensions": [], "prompts": [], "themes": [] },
    { "source": "git:github.com/Egonex-AI/Understand-Anything@6ae71878beb50226a1e4b7e2f52ac6468c86f74b",
      "skills": ["understand-anything-plugin/skills"], "extensions": [], "prompts": [], "themes": [] }
  ]
}
```

`skills`, `prompts`, `extensions` and `agents` in the repo root are
auto-discovered and need no settings entry. Paths in a global
`settings.json` resolve relative to the agent dir.

## Error handling

- **Clone fails** (offline, no network): the wrapper exits with git's error.
  A pre-existing directory is used as-is, so offline restarts work.
- **Pull fails**: non-fatal, `|| true`. Never blocks a session.
- **Dirty working tree**: pull skipped entirely.
- **Package install fails**: pi reports it at startup and continues without
  that package's resources. Sessions still start.
- **`rtk` absent from `PATH`**: `extensions/rtk.ts` passes the command
  through unchanged. The extension is a no-op rather than a failure.
- **Secret Service unavailable**: `pi-mcp-adapter` fails closed on OAuth
  credentials rather than writing plaintext. Only affects OAuth MCP servers;
  context7 is unauthenticated HTTP.
- **Extension factory errors**: pi logs and continues. Per pi's own guidance,
  extensions must not start background resources in the factory — do that in
  `session_start`, tear down in `session_shutdown`.

## Testing

- `nix flake check` on both `.app` repos.
- `scripts/check.sh` in both config repos, run by GitHub Actions on push and
  pull request.
- Manual acceptance per profile:
  1. `rm -rf ~/.pi-power-dev && nix run ~/repos/pi-power-dev.app` clones, installs packages and starts.
  2. `/skill:brainstorming` resolves (superpowers loaded from a package).
  3. Ponytail mode reports active at session start.
  4. `memory_search` is present (pi-hermes-memory loaded).
  5. `~/.pi-power-dev/auth.json` and `sessions/` exist and `git status` stays clean.
  6. `PI_CODING_AGENT_DIR=~/.pi-power-dev pi` behaves identically without Nix.
- `rtk hook check` for a dry run of the rewriting extension before enabling it.

## Out of scope

- Migrating existing Claude sessions or claude-mem history into pi.
- Retiring the Claude profiles. Both continue to work unchanged.
- A `--profile` selector wrapper equivalent to `modules/pc/claude-code.sh`.
  Each app is its own entry point.
- Publishing any of these as pi packages to the gallery.
