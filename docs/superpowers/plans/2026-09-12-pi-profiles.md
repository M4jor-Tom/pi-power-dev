# pi.dev Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build four repositories — two pi.dev agent-directory profiles (`pi-power-dev`, `pi-game-dev`) and two Nix apps that clone them, supply their dependencies, and run pi against them.

**Architecture:** A `.pi-*` repo *is* a pi agent dir: `PI_CODING_AGENT_DIR` replaces the `agent` subdirectory, so `~/.pi-power-dev/settings.json` is what `~/.pi/agent/settings.json` would be. Everything third-party arrives through pinned `packages[]` entries in `settings.json`, which pi clones into the gitignored `git/` and `npm/` subtrees — no submodules and no nested git repositories. The `.app` flakes are `writeShellApplication` wrappers that clone the config repo, put the CLI dependencies on `PATH`, and `exec pi`.

**Tech Stack:** pi-coding-agent 0.85.1 (nixpkgs), Nix flakes, POSIX `sh`, TypeScript (pi extensions, loaded by jiti), `node --test` with Node 24 type stripping, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-12-pi-profiles-design.md`

## Global Constraints

- GitHub owner is `M4jor-Tom`. All four repos are **public**, matching the predecessor profiles `claude-power-dev` and `claude-game-dev`. No secrets are involved: `auth.json`, `trust.json` and every runtime path are gitignored.
- Flake and clone URLs use `git+https://` / `https://`, **never** `git+ssh://`.
- `PI_CODING_AGENT_DIR` points at the agent dir itself. `~/.pi-power-dev/settings.json`, **not** `~/.pi-power-dev/agent/settings.json`.
- `settings.json` must remain a writable regular file — pi merges its own fields into it under a lock. Never symlink it out of the Nix store.
- pi supports **no `@`-imports** in context files. `AGENTS.md` is one self-contained file.
- pi has **no `hooks` key** in `settings.json`. Hook behaviour lives in `extensions/*.ts`.
- Prompt-template discovery is **non-recursive**; skill discovery **recurses**.
- Never track `auth.json`, `trust.json`, `models-store.json`, or any of `sessions/ bin/ npm/ git/ node_modules/ experimental/ pi-hermes-memory/ projects-memory/ hermes-memory-config.json pi-debug.log`.
- Extension source files live in `extensions/*.ts`. Tests live in `tests/` — a `*.test.ts` inside `extensions/` would be loaded as an extension.
- Extensions must not start background resources in the factory function; use `session_start` / `session_shutdown`.
- Commit messages follow Conventional Commits (`<type>[(scope)][!]: <description>`).
- Pinned upstream refs, used verbatim:
  - `git:github.com/obra/superpowers@b36e0829c6d0140e93cfef2ca599b1b07d4a7797`
  - `git:github.com/DietrichGebert/ponytail@v4.9.0`
  - `git:github.com/anthropics/claude-plugins-official@ed404106fcd80ba98ecb7c851e531dcb626d13b7`
  - `git:github.com/nextlevelbuilder/ui-ux-pro-max-skill@1307d97a72e6c1cda572cb65471ae5ce82995218`
  - `git:github.com/Egonex-AI/Understand-Anything@6ae71878beb50226a1e4b7e2f52ac6468c86f74b`
  - `git:github.com/gamedev-skills/awesome-gamedev-agent-skills@9ca5296b219049c5b68494e1f3c274ead6d727b3`
  - `git:github.com/M4jor-Tom/claude-ontology-skill@13bfe0ce8c46fbd3d77e9faf94ebeb6ba4f5bab3`
  - `npm:pi-hermes-memory@0.9.8`
  - `npm:pi-mcp-adapter@2.33.0`
  - `npm:pi-subagents@0.67.0`

---

### Task 1: Create the four GitHub repositories

`gh` is not installed on this machine and the flakes hard-code `https://github.com/M4jor-Tom/<repo>.git`, so the remotes must exist before anything references them.

**Files:**
- Create: none (remote side effects only)

**Interfaces:**
- Produces: four private repos — `M4jor-Tom/pi-power-dev`, `M4jor-Tom/pi-game-dev`, `M4jor-Tom/pi-power-dev.app`, `M4jor-Tom/pi-game-dev.app`

- [ ] **Step 1: Install `gh`**

```bash
nix profile install nixpkgs#gh
gh --version
```

Expected: `gh version 2.97.0` or newer.

- [ ] **Step 2: Authenticate (the human runs this — it is interactive)**

Ask the user to run, in their own terminal or by prefixing the line with `!` in this session:

```bash
gh auth login
```

- [ ] **Step 3: Verify authentication**

```bash
gh auth status
```

Expected: `Logged in to github.com account M4jor-Tom`. Do not continue until this passes.

- [ ] **Step 4: Create the four repositories**

```bash
for r in pi-power-dev pi-game-dev pi-power-dev.app pi-game-dev.app; do
  gh repo create "M4jor-Tom/$r" --private \
    --description "pi.dev profile / app: $r"
done
```

- [ ] **Step 5: Verify all four exist**

```bash
for r in pi-power-dev pi-game-dev pi-power-dev.app pi-game-dev.app; do
  gh repo view "M4jor-Tom/$r" --json name,isPrivate -q '.name + " private=" + (.isPrivate|tostring)'
done
```

Expected: four lines, each `private=true`.

---

### Task 2: `pi-power-dev` — bootable agent directory

The authoring clone already exists at `~/repos/pi-power-dev` with the spec and this plan committed. This task makes it a valid pi agent dir and gives the repo its test harness.

`scripts/check.sh` is the test suite for both config repos. Every later task extends it first, watches it fail, then adds the artifact that makes it pass.

**Files:**
- Create: `~/repos/pi-power-dev/.gitignore`
- Create: `~/repos/pi-power-dev/scripts/check.sh`
- Create: `~/repos/pi-power-dev/settings.json`
- Create: `~/repos/pi-power-dev/mcp.json`
- Create: `~/repos/pi-power-dev/AGENTS.md`
- Create: `~/repos/pi-power-dev/README.md`
- Create: `~/repos/pi-power-dev/.github/workflows/check.yml`

**Interfaces:**
- Produces: `scripts/check.sh`, exit 0 on success, one `FAIL: <reason>` line per problem on stderr-visible stdout. Later tasks add assertions to it.
- Produces: `settings.json` with a `packages` array that later tasks append to.

- [ ] **Step 1: Write the failing test**

Create `scripts/check.sh`:

```sh
#!/usr/bin/env sh
# Verify this pi agent dir is well-formed: config parses, memory exists,
# skills and prompts declare what pi needs, machine-local state is untracked.
set -eu
cd "$(dirname "$0")/.."

fail=0
err() { echo "FAIL: $*"; fail=1; }

# JSON config must parse, or pi starts with defaults and says nothing useful.
for f in settings.json mcp.json; do
  if [ ! -f "$f" ]; then err "missing $f"; continue; fi
  if ! jq empty "$f" 2>/dev/null; then err "$f is not valid JSON"; fi
done

# Global memory. pi loads this as a context file at every session start.
if [ ! -s AGENTS.md ]; then err "AGENTS.md missing or empty"; fi

# Machine-local state must never be tracked.
for leak in auth.json trust.json models-store.json hermes-memory-config.json; do
  if git ls-files --error-unmatch "$leak" >/dev/null 2>&1; then
    err "tracked machine-local state: $leak"
  fi
done

if [ "$fail" -eq 0 ]; then echo "OK: agent dir is well-formed"; fi
exit "$fail"
```

```bash
chmod +x scripts/check.sh
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd ~/repos/pi-power-dev && sh scripts/check.sh; echo "exit=$?"`

Expected: FAIL lines for `missing settings.json`, `missing mcp.json`, `AGENTS.md missing or empty`, and `exit=1`.

- [ ] **Step 3: Write `.gitignore`**

Create `.gitignore`:

```gitignore
# This repo IS a pi agent dir (PI_CODING_AGENT_DIR points here), so pi writes
# its runtime state next to the tracked config. Everything below is either a
# secret, a cache, or derived from settings.json.

# Credentials and per-machine decisions.
auth.json
trust.json

# Provider catalog cache; refresh with `pi update --models`.
models-store.json

# Session history, and the fd/rg binaries pi downloads when they are not on PATH.
sessions/
bin/

# Package installs, driven by the pinned packages[] array in settings.json.
npm/
git/
node_modules/

experimental/
pi-debug.log
*.bak

# pi-hermes-memory state. Per-profile by construction, because it resolves
# its paths from the agent dir.
pi-hermes-memory/
projects-memory/
hermes-memory-config.json
```

- [ ] **Step 4: Write `settings.json`**

Create `settings.json`. `packages` is deliberately short here; Tasks 5 and 7 append to it.

```json
{
  "defaultThinkingLevel": "xhigh",
  "defaultProjectTrust": "ask",
  "enableSkillCommands": true,
  "packages": [
    "git:github.com/obra/superpowers@b36e0829c6d0140e93cfef2ca599b1b07d4a7797",
    "git:github.com/DietrichGebert/ponytail@v4.9.0",
    "npm:pi-hermes-memory@0.9.8"
  ]
}
```

- [ ] **Step 5: Write `mcp.json`**

Create `mcp.json`. Read by `pi-mcp-adapter`, which Task 7 installs.

```json
{
  "mcpServers": {
    "context7": {
      "type": "http",
      "url": "https://mcp.context7.com/mcp",
      "lifecycle": "lazy"
    }
  }
}
```

- [ ] **Step 6: Write `AGENTS.md`**

Create `AGENTS.md`. This is `~/.claude-power-dev/CLAUDE.md` with its two `@`-imports inlined, kept in the original French, and with the Claude-specific mechanics retargeted at pi. The `rules/context7.md` content is deliberately absent — Task 4 makes it an on-demand skill.

```markdown
# Profil pi : power-dev

## Git

Format des commits : `<type>[(scope)][!]: <description>`, corps et footers
séparés par une ligne vide.

Types : `feat` (MINOR) · `fix` (PATCH) · `refactor` · `test` · `docs` · `ci` ·
`chore` · `perf` · `build`.
Breaking change : `!` après le type/scope **ou** footer `BREAKING CHANGE:`
(MAJOR, sensible à la casse).
Référence : https://www.conventionalcommits.org/en/v1.0.0/

Gitflow : branches `feature/*`, `fix/*`, `release/*` depuis `develop`, merge
vers `main` à la release. Ne **jamais** merge en fast-forward, toujours
`--no-ff`.

## RTK — Rust Token Killer

Proxy CLI optimisé tokens (60-90 % d'économie sur les opérations de dev).

Méta-commandes, à taper telles quelles :

```bash
rtk gain              # Analytics des économies de tokens
rtk gain --history    # Historique des commandes avec économies
rtk discover          # Repère les opportunités manquées
rtk proxy <cmd>       # Exécute une commande brute sans filtrage (debug)
```

Toutes les autres commandes sont réécrites automatiquement par
`extensions/rtk.ts` : `git status` devient `rtk git status` avant exécution.
Aucun préfixe à taper à la main. `rtk hook check "<cmd>"` montre la
réécriture sans l'appliquer.

⚠ Collision de nom : si `rtk gain` échoue, c'est probablement
reachingforthejack/rtk (Rust Type Kit) qui est installé à la place.

## Commandes Bash

Préférer ces outils aux équivalents par défaut. Fallback silencieux si absent.

- **Recherche de contenu** : `rg` plutôt que `grep`
- **Recherche de fichiers** : `fd` plutôt que `find`
- **JSON** : `jq` pour tout parsing, filtrage ou transformation
- **YAML/TOML** : `yq`
- **GitHub** : `gh` pour PRs, issues, reviews, CI, releases. Ne pas scraper
  github.com ni taper l'API REST quand `gh` suffit.
- **GitLab** : `glab` pour MRs, issues, reviews, CI, releases. Idem.

## Workflow agents

- **Invoquer `/skill:using-superpowers` en début de session** pour toute
  demande de développement, fonctionnalité ou implémentation ; pas pour une
  question simple.
- Pour toute tâche non triviale (3+ étapes ou décision d'architecture),
  commencer par `/skill:brainstorming`. pi n'a pas de plan mode : la
  discipline vient du skill, pas du harness.
- **Vérifier dans le navigateur** (`/skill:playwright-cli`) sur **toute** US
  à incidence UI.
- Toujours terminer une tâche de code par `/simplify`, puis
  `/skill:ponytail-review`, puis appliquer les ajustements.

## Orchestration

- Si ça dérape, STOP et re-planifier immédiatement — ne pas s'acharner.
- Écrire des specs détaillées en amont pour réduire l'ambiguïté.
- Utiliser l'outil `subagent` librement pour garder le contexte principal
  propre : déléguer recherche, exploration et analyse parallèle. Les agents
  disponibles sont définis dans `agents/`.
- Après TOUTE correction de l'utilisateur : noter le pattern dans
  `tasks/lessons.md` et écrire une règle pour soi-même.
- Ne jamais marquer une tâche comme terminée sans prouver qu'elle fonctionne :
  lancer les tests, vérifier les logs, démontrer la correction.
- Pour les changements non triviaux : se demander « existe-t-il une façon plus
  élégante ? ». Sauter cette étape pour les fixes simples et évidents.

## Principes

- **Simplicité d'abord** : rendre chaque changement aussi simple que possible.
- **Pas de paresse** : trouver les causes racines. Pas de fix temporaire.
- **Impact minimal** : ne toucher que le nécessaire.

## Langue

Répondre en anglais. Termes techniques et identifiants de code restent tels
quels.
```

- [ ] **Step 7: Write `README.md`**

Create `README.md`:

````markdown
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
````

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd ~/repos/pi-power-dev && sh scripts/check.sh; echo "exit=$?"`

Expected: `OK: agent dir is well-formed`, `exit=0`.

- [ ] **Step 9: Add CI**

Create `.github/workflows/check.yml`:

```yaml
name: check
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: sh scripts/check.sh
```

- [ ] **Step 10: Commit and push**

```bash
cd ~/repos/pi-power-dev
git remote add origin https://github.com/M4jor-Tom/pi-power-dev.git
git add -A
git commit -m "feat: bootable pi agent dir with integrity check"
git push -u origin main
```

---

### Task 3: `pi-power-dev` — port the six authored skills

**Files:**
- Create: `~/repos/pi-power-dev/skills/{graphify,llm-council,markitdown,playwright-cli,prd,writing-adrs}/` (copied from `~/.claude-power-dev/skills/`)
- Modify: `~/repos/pi-power-dev/scripts/check.sh`

**Interfaces:**
- Consumes: `scripts/check.sh` from Task 2
- Produces: `skills/` containing directories each with a `SKILL.md` carrying `name:` and `description:` frontmatter

- [ ] **Step 1: Write the failing test**

Append to `scripts/check.sh`, immediately before the final `if [ "$fail" -eq 0 ]` block:

```sh
# Every skill needs name and description. pi refuses to load a skill with no
# description and warns on a malformed name.
skills=0
for s in skills/*/; do
  [ -d "$s" ] || continue
  f="${s}SKILL.md"
  if [ ! -f "$f" ]; then err "no SKILL.md in $s"; continue; fi
  if ! awk 'NR<=20 && /^name:/{found=1} END{exit !found}' "$f"; then
    err "$f has no name in frontmatter"
  fi
  if ! awk 'NR<=20 && /^description:/{found=1} END{exit !found}' "$f"; then
    err "$f has no description in frontmatter"
  fi
  skills=$((skills + 1))
done
if [ "$skills" -lt 6 ]; then err "expected >= 6 skills, found $skills"; fi
```

And change the success line to report the count:

```sh
if [ "$fail" -eq 0 ]; then echo "OK: agent dir is well-formed, $skills skills"; fi
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd ~/repos/pi-power-dev && sh scripts/check.sh; echo "exit=$?"`

Expected: `FAIL: expected >= 6 skills, found 0`, `exit=1`.

- [ ] **Step 3: Copy the skills**

They are already in the Agent Skills format pi implements, so they transfer unchanged. `-L` dereferences in case any is a symlink.

```bash
cd ~/repos/pi-power-dev
mkdir -p skills
for s in graphify llm-council markitdown playwright-cli prd writing-adrs; do
  cp -RL "$HOME/.claude-power-dev/skills/$s" skills/
done
ls skills/
```

Expected: the six directory names.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd ~/repos/pi-power-dev && sh scripts/check.sh; echo "exit=$?"`

Expected: `OK: agent dir is well-formed, 6 skills`, `exit=0`.

- [ ] **Step 5: Commit**

```bash
cd ~/repos/pi-power-dev
git add skills scripts/check.sh
git commit -m "feat(skills): port the six authored power-dev skills"
```

---

### Task 4: `pi-power-dev` — the context7 skill

`~/.claude-power-dev/rules/context7.md` is loaded on every Claude session by directory convention. pi has no `rules/` convention, and the rule is conditional, so it becomes an on-demand skill.

**Files:**
- Create: `~/repos/pi-power-dev/skills/context7/SKILL.md`
- Modify: `~/repos/pi-power-dev/scripts/check.sh`

**Interfaces:**
- Consumes: `mcp.json` from Task 2 (the `context7` server entry), `pi-mcp-adapter` from Task 7 (the `mcp` tool)
- Produces: a skill named `context7`

- [ ] **Step 1: Write the failing test**

In `scripts/check.sh`, raise the skill floor and assert the skill exists by name. Replace the `if [ "$skills" -lt 6 ]` line with:

```sh
if [ "$skills" -lt 7 ]; then err "expected >= 7 skills, found $skills"; fi
if [ ! -f skills/context7/SKILL.md ]; then err "missing skills/context7/SKILL.md"; fi
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd ~/repos/pi-power-dev && sh scripts/check.sh; echo "exit=$?"`

Expected: `FAIL: expected >= 7 skills, found 6` and `FAIL: missing skills/context7/SKILL.md`, `exit=1`.

- [ ] **Step 3: Write the skill**

Create `skills/context7/SKILL.md`:

````markdown
---
name: context7
description: Fetch current documentation for a library, framework, SDK, API, CLI tool or cloud service before answering. Use whenever the question concerns API syntax, configuration, version migration, installation, CLI usage or library-specific debugging — even for well-known libraries like React, Next.js, Prisma, Express, Tailwind, Django or Spring Boot, because training data may not reflect recent changes. Prefer this over a web search for library documentation.
---

# Context7

Up-to-date library documentation, served over MCP through the `mcp` proxy
tool that `pi-mcp-adapter` registers. The server is declared in this
profile's `mcp.json` and starts lazily on first use.

## When to use this

Any question about a library, framework, SDK, API, CLI tool or cloud
service. That includes API syntax, configuration, version migration,
library-specific debugging, installation instructions and CLI usage. Use it
even when you think you know the answer.

## When not to use this

Refactoring, writing scripts from scratch, debugging business logic, code
review, or general programming concepts. None of those are documentation
questions.

## Steps

1. Resolve the library ID first, unless the user gave you an exact
   `/org/project` ID:

   ```
   mcp({ tool: "context7:resolve-library-id", args: { libraryName: "<name>", question: "<the full question>" } })
   ```

2. Pick the best match on: exact name match, description relevance, snippet
   count, source reputation, benchmark score. If the results look wrong, try
   an alternate spelling — `next.js`, not `nextjs`.

3. Query with the selected ID and the **full question**, not a single word:

   ```
   mcp({ tool: "context7:query-docs", args: { libraryId: "/org/project", question: "<the full question>" } })
   ```

4. Answer from the returned documentation.

## If the tool is missing

`mcp` is registered by `pi-mcp-adapter`, pinned in `settings.json`. If the
tool does not exist, the package failed to install — say so rather than
falling back to memory, then continue with a web search and label the answer
as potentially stale.
````

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd ~/repos/pi-power-dev && sh scripts/check.sh; echo "exit=$?"`

Expected: `OK: agent dir is well-formed, 7 skills`, `exit=0`.

- [ ] **Step 5: Commit**

```bash
cd ~/repos/pi-power-dev
git add skills/context7 scripts/check.sh
git commit -m "feat(skills): turn the context7 rule into an on-demand skill"
```

---

### Task 5: `pi-power-dev` — prompt templates

pi's slash commands. Filename minus `.md` is the command name; discovery is non-recursive.

**Files:**
- Create: `~/repos/pi-power-dev/prompts/simplify.md`
- Create: `~/repos/pi-power-dev/prompts/graphify.md`
- Create: `~/repos/pi-power-dev/prompts/revise-agents-md.md`
- Modify: `~/repos/pi-power-dev/scripts/check.sh`

**Interfaces:**
- Consumes: `skills/graphify` from Task 3
- Produces: `/simplify`, `/graphify`, `/revise-agents-md`

`settings.json` is deliberately untouched: pi auto-discovers `prompts/` in the
agent dir, so prompt templates need no settings entry.

- [ ] **Step 1: Write the failing test**

Append to `scripts/check.sh`, before the final `if [ "$fail" -eq 0 ]` block:

```sh
# Prompt templates are pi's slash commands. Discovery is non-recursive, so a
# template in a subdirectory silently does nothing.
prompts=0
for p in prompts/*.md; do
  [ -f "$p" ] || continue
  if [ ! -s "$p" ]; then err "empty prompt template: $p"; fi
  prompts=$((prompts + 1))
done
if [ "$prompts" -lt 3 ]; then
  err "expected >= 3 prompt templates, found $prompts"
fi
if find prompts -mindepth 2 -name '*.md' 2>/dev/null | grep -q .; then
  err "prompts/ has nested .md files; discovery is non-recursive"
fi
```

And update the success line:

```sh
if [ "$fail" -eq 0 ]; then
  echo "OK: agent dir is well-formed, $skills skills, $prompts prompts"
fi
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd ~/repos/pi-power-dev && sh scripts/check.sh; echo "exit=$?"`

Expected: `FAIL: expected >= 3 prompt templates, found 0`, `exit=1`.

The floor is deliberately unconditional — no `[ -d prompts ]` guard. Guarding it
on the directory's existence would make a wholesale deletion of `prompts/` pass
silently, and would be asymmetric with the skills floor above, which has no such
guard.

- [ ] **Step 3: Write the prompt templates**

Create `prompts/simplify.md`:

```markdown
---
description: Simplify the code just written without changing its behaviour
argument-hint: "[path or scope]"
---
Review ${@:-the changes you just made} and simplify them.

For each construct, stop at the first of these that holds:

1. Does it need to exist at all? Speculative need means delete it.
2. Does something in this codebase already do it? Reuse that.
3. Does the standard library do it? Use it.
4. Does a native platform feature cover it? Use it.
5. Does an already-installed dependency solve it? Use it. Never add a new
   dependency for what a few lines can do.
6. Can it be one line? Make it one line.

Then report what you removed and what you deliberately kept. Do not change
behaviour, do not rename anything for taste, and do not touch code outside
the scope above. Run the tests afterwards and show the result.
```

Create `prompts/graphify.md`:

```markdown
---
description: Build or query a graphify knowledge graph for this codebase
argument-hint: "[path | URL | query \"question\"]"
---
Use the graphify skill. Read `skills/graphify/SKILL.md` in this profile and
follow it exactly for: /graphify ${@:-.}
```

Create `prompts/revise-agents-md.md`:

```markdown
---
description: Audit and improve this project's AGENTS.md
---
Audit the AGENTS.md that applies to the current working directory — the
project one, not this profile's global file — and propose improvements.

Check for: instructions that contradict each other, rules the codebase no
longer follows, commands that no longer exist, missing conventions a new
contributor would get wrong, and anything stated so vaguely it cannot be
acted on.

Show a diff. Do not apply it until I approve.
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd ~/repos/pi-power-dev && sh scripts/check.sh; echo "exit=$?"`

Expected: `OK: agent dir is well-formed, 7 skills, 3 prompts`, `exit=0`.

- [ ] **Step 5: Commit**

```bash
cd ~/repos/pi-power-dev
git add prompts scripts/check.sh
git commit -m "feat(prompts): add simplify, graphify and revise-agents-md commands"
```

---

### Task 6: `pi-power-dev` — the rtk and guard extensions

`RTK.md` has always claimed commands are rewritten automatically. No such hook was ever wired — the NixOS `rtk.enable` flag only installs the binary. This task makes the claim true, and reimplements the two `permissions.deny` entries that pi's absent permission system would otherwise drop.

`rtk`'s contract, confirmed by running it:

```
$ echo '{"tool_name":"Bash","tool_input":{"command":"git status"}}' | rtk hook claude
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecisionReason":"RTK auto-rewrite","updatedInput":{"command":"rtk git status"}}}
$ echo '{"tool_name":"Bash","tool_input":{"command":"echo hi"}}' | rtk hook claude
$ rtk hook check "git status"
rtk git status
```

Empty stdout means no rewrite. Exit status is 0 either way.

Both extensions keep their pi import as `import type`, which Node's type
stripping erases, so `node --test` can import them without pi installed.

**Files:**
- Create: `~/repos/pi-power-dev/extensions/rtk.ts`
- Create: `~/repos/pi-power-dev/extensions/guard.ts`
- Create: `~/repos/pi-power-dev/tests/rtk.test.ts`
- Create: `~/repos/pi-power-dev/tests/guard.test.ts`
- Modify: `~/repos/pi-power-dev/scripts/check.sh`

**Interfaces:**
- Produces: `rtkRewrite(command: string): string | undefined` from `extensions/rtk.ts`
- Produces: `denyReason(command: string): string | undefined` from `extensions/guard.ts`
- Produces: default-exported extension factories `(pi: ExtensionAPI) => void` from both files

- [ ] **Step 1: Write the failing tests**

Create `tests/rtk.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { rtkRewrite } from "../extensions/rtk.ts";

const haveRtk = (() => {
	try {
		execFileSync("rtk", ["--version"], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
})();

test("rewrites a command rtk knows about", { skip: !haveRtk }, () => {
	assert.equal(rtkRewrite("git status"), "rtk git status");
});

test("leaves a command rtk has no rewrite for", { skip: !haveRtk }, () => {
	assert.equal(rtkRewrite("echo hello"), undefined);
});

test("agrees with rtk's own dry run", { skip: !haveRtk }, () => {
	const dryRun = execFileSync("rtk", ["hook", "check", "ls -la src"], {
		encoding: "utf-8",
	}).trim();
	assert.equal(rtkRewrite("ls -la src"), dryRun);
});

test("returns undefined when rtk is not on PATH", () => {
	const path = process.env.PATH;
	process.env.PATH = "/nonexistent";
	try {
		assert.equal(rtkRewrite("git status"), undefined);
	} finally {
		process.env.PATH = path;
	}
});
```

Create `tests/guard.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { denyReason } from "../extensions/guard.ts";

test("blocks terraform destroy", () => {
	assert.match(String(denyReason("terraform destroy -auto-approve")), /terraform/);
});

test("blocks tofu destroy", () => {
	assert.match(String(denyReason("tofu destroy")), /tofu/);
});

test("blocks it mid-pipeline too", () => {
	assert.ok(denyReason("cd infra && terraform destroy"));
});

test("allows terraform plan and apply", () => {
	assert.equal(denyReason("terraform plan"), undefined);
	assert.equal(denyReason("terraform apply"), undefined);
});

test("does not match a destroy that is not terraform's", () => {
	assert.equal(denyReason("./destroy.sh"), undefined);
	assert.equal(denyReason("echo terraform destroys nothing"), undefined);
});

test("blocks a newline-separated destroy", () => {
	assert.ok(denyReason("echo hi\nterraform destroy"));
});

test("blocks despite quoting the subcommand", () => {
	assert.ok(denyReason('terraform "destroy"'));
	assert.ok(denyReason("terraform 'destroy'"));
});

test("blocks inside command substitution", () => {
	assert.ok(denyReason("$(terraform destroy)"));
});

test("blocks inside backtick substitution", () => {
	assert.ok(denyReason("`terraform destroy`"));
	assert.ok(denyReason("echo `terraform destroy`"));
});

test("blocks with leading whitespace or doubled spacing", () => {
	assert.ok(denyReason("  terraform destroy"));
	assert.ok(denyReason("terraform  destroy"));
});

test("blocks when reached through xargs", () => {
	assert.ok(denyReason("xargs terraform destroy"));
});

test("does not block terraform destroy-plan", () => {
	assert.equal(denyReason("terraform destroy-plan"), undefined);
});
```

The six cases after the original five are regression tests: each is a command
shape the first version of these regexes silently let through. A guard against
an irreversible action has to be tested against the shapes that defeat it, not
only the shape that motivated it.

- [ ] **Step 2: Run them to make sure they fail**

Run: `cd ~/repos/pi-power-dev && node --test 'tests/*.test.ts'`

Expected: FAIL — `Cannot find module '../extensions/rtk.ts'`.

- [ ] **Step 3: Write `extensions/rtk.ts`**

```typescript
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
		stdout = execFileSync("rtk", ["hook", "claude"], {
			input: JSON.stringify({ tool_name: "Bash", tool_input: { command } }),
			encoding: "utf-8",
			timeout: 5000,
		});
	} catch {
		return undefined;
	}
	if (!stdout.trim()) return undefined;
	try {
		const rewritten = JSON.parse(stdout)?.hookSpecificOutput?.updatedInput?.command;
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
```

- [ ] **Step 4: Write `extensions/guard.ts`**

```typescript
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd ~/repos/pi-power-dev && node --test 'tests/*.test.ts'`

Expected: 16 tests pass (4 rtk + 12 guard), 0 fail. If a guard case fails, the regex is wrong, not the test — every one of those cases is a shell shape that reaches the same execution.

- [ ] **Step 6: Add the extension assertions to `check.sh`**

Append to `scripts/check.sh`, before the final `if [ "$fail" -eq 0 ]` block:

```sh
# pi loads every extensions/*.ts as an extension, so a stray test file there
# would run as one. Tests live in tests/.
for e in extensions/*.ts; do
  [ -f "$e" ] || continue
  case "$e" in
    *.test.ts) err "test file in extensions/ would load as an extension: $e" ;;
  esac
done

# Extension unit tests.
if [ -d tests ] && command -v node >/dev/null 2>&1; then
  if ! node --test 'tests/*.test.ts' >/dev/null 2>&1; then err "node --test 'tests/*.test.ts' failed"; fi
fi
```

- [ ] **Step 7: Run check.sh to verify it passes**

Run: `cd ~/repos/pi-power-dev && sh scripts/check.sh; echo "exit=$?"`

Expected: `OK: agent dir is well-formed, 7 skills, 3 prompts`, `exit=0`.

- [ ] **Step 8: Add Node to CI**

Modify `.github/workflows/check.yml` — the `check.sh` extension assertion needs `node`:

```yaml
name: check
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
      - run: sh scripts/check.sh
```

Note: `rtk` is absent on the runner, so the three `haveRtk` tests skip there and the fourth still runs. That is intended — CI proves the guard logic and the graceful-degradation path; the rtk contract is proven locally and by Task 11.

- [ ] **Step 9: Commit**

```bash
cd ~/repos/pi-power-dev
git add extensions tests scripts/check.sh .github
git commit -m "feat(extensions): wire rtk command rewriting and the destroy guard"
```

---

### Task 7: `pi-power-dev` — remaining packages, subagents and MCP

**Files:**
- Modify: `~/repos/pi-power-dev/settings.json`
- Create: `~/repos/pi-power-dev/agents/*.md` (ten files, copied)
- Modify: `~/repos/pi-power-dev/scripts/check.sh`

**Interfaces:**
- Consumes: `settings.json` and `mcp.json` from Task 2
- Produces: the `mcp` tool (via `pi-mcp-adapter`), the `subagent` tool (via `pi-subagents`), and ten agent definitions

- [ ] **Step 1: Write the failing test**

Append to `scripts/check.sh`, before the final `if [ "$fail" -eq 0 ]` block:

```sh
# Every package source must be pinned. An unpinned git ref silently drifts,
# and packages[] is the only manifest pi has.
unpinned=$(jq -r '
  .packages // []
  | map(if type == "string" then . else .source end)
  | map(select(test("^(npm|git):") and (test("@[^/]+$") | not)))
  | .[]' settings.json 2>/dev/null || true)
if [ -n "$unpinned" ]; then
  err "unpinned package source(s): $(echo "$unpinned" | tr '\n' ' ')"
fi

# Agent definitions feed pi-subagents. It reads <agent-dir>/agents/*.md
# whenever PI_CODING_AGENT_DIR is set, which it always is for this profile.
agents=0
for a in agents/*.md; do
  [ -f "$a" ] || continue
  if ! awk 'NR<=20 && /^name:/{found=1} END{exit !found}' "$a"; then
    err "$a has no name in frontmatter"
  fi
  if ! awk 'NR<=20 && /^description:/{found=1} END{exit !found}' "$a"; then
    err "$a has no description in frontmatter"
  fi
  agents=$((agents + 1))
done
if [ "$agents" -lt 10 ]; then err "expected >= 10 agents, found $agents"; fi

# The MCP servers mcp.json declares are only reachable if the adapter is pinned.
if jq -e '.mcpServers | length > 0' mcp.json >/dev/null 2>&1; then
  if ! jq -e '
    (.packages // [])
    | map(if type == "string" then . else .source end)
    | any(startswith("npm:pi-mcp-adapter"))' settings.json >/dev/null 2>&1; then
    err "mcp.json declares servers but pi-mcp-adapter is not in packages[]"
  fi
fi
```

Update the success line:

```sh
if [ "$fail" -eq 0 ]; then
  echo "OK: agent dir is well-formed, $skills skills, $prompts prompts, $agents agents"
fi
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd ~/repos/pi-power-dev && sh scripts/check.sh; echo "exit=$?"`

Expected: `FAIL: expected >= 10 agents, found 0` and `FAIL: mcp.json declares servers but pi-mcp-adapter is not in packages[]`, `exit=1`.

- [ ] **Step 3: Complete `settings.json`**

Replace `settings.json` with the full package set:

```json
{
  "defaultThinkingLevel": "xhigh",
  "defaultProjectTrust": "ask",
  "enableSkillCommands": true,
  "packages": [
    "git:github.com/obra/superpowers@b36e0829c6d0140e93cfef2ca599b1b07d4a7797",
    "git:github.com/DietrichGebert/ponytail@v4.9.0",
    "npm:pi-hermes-memory@0.9.8",
    "npm:pi-mcp-adapter@2.33.0",
    "npm:pi-subagents@0.67.0",
    {
      "source": "git:github.com/anthropics/claude-plugins-official@ed404106fcd80ba98ecb7c851e531dcb626d13b7",
      "skills": [
        "plugins/frontend-design/skills",
        "plugins/claude-md-management/skills"
      ],
      "extensions": [],
      "prompts": [],
      "themes": []
    },
    {
      "source": "git:github.com/nextlevelbuilder/ui-ux-pro-max-skill@1307d97a72e6c1cda572cb65471ae5ce82995218",
      "skills": [".claude/skills"],
      "extensions": [],
      "prompts": [],
      "themes": []
    },
    {
      "source": "git:github.com/Egonex-AI/Understand-Anything@6ae71878beb50226a1e4b7e2f52ac6468c86f74b",
      "skills": ["understand-anything-plugin/skills"],
      "extensions": [],
      "prompts": [],
      "themes": []
    }
  ]
}
```

- [ ] **Step 4: Copy the ten agent definitions**

They already use the `name`/`description`/`tools`/`model` frontmatter `pi-subagents` expects.

```bash
cd ~/repos/pi-power-dev
mkdir -p agents
cp "$HOME/.claude-power-dev/plugins/marketplaces/understand-anything/understand-anything-plugin/agents/"*.md agents/
ls agents/ | wc -l
```

Expected: `10`.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd ~/repos/pi-power-dev && sh scripts/check.sh; echo "exit=$?"`

Expected: `OK: agent dir is well-formed, 7 skills, 3 prompts, 10 agents`, `exit=0`.

- [ ] **Step 6: Commit and push**

```bash
cd ~/repos/pi-power-dev
git add settings.json agents scripts/check.sh
git commit -m "feat(packages): pin every upstream, add MCP adapter and subagents"
git push
```

---

### Task 8: `pi-power-dev.app` — the Nix app

**Files:**
- Create: `~/repos/pi-power-dev.app/flake.nix`
- Create: `~/repos/pi-power-dev.app/package.nix`
- Create: `~/repos/pi-power-dev.app/README.md`
- Create: `~/repos/pi-power-dev.app/.gitignore`

**Interfaces:**
- Consumes: the `M4jor-Tom/pi-power-dev` repo from Task 7
- Produces: `apps.<system>.default` running `bin/pi-power-dev`; `packages.<system>.default` exposing the same wrapper; `overlays.default` adding `pi-power-dev`

`package.nix` is parameterised so Task 10 can reuse it verbatim with different arguments.

- [ ] **Step 1: Create the repo and write `package.nix`**

```bash
mkdir -p ~/repos/pi-power-dev.app && cd ~/repos/pi-power-dev.app && git init -b main
```

Create `package.nix`:

```nix
{ lib
, writeShellApplication
, pi-coding-agent
, git
, gh
, glab
, nodejs
, bun
, ripgrep
, fd
, jq
, yq-go
, uv
, python3
, rtk
, graphify
, markitdown
, pandoc
, poppler-utils
, yt-dlp
  # Which profile this wrapper runs. Task 10 reuses this file with the
  # pi-game-dev values.
, profileName ? "pi-power-dev"
, configRepo ? "https://github.com/M4jor-Tom/pi-power-dev.git"
, dirEnvVar ? "PI_POWER_DEV_DIR"
}:

writeShellApplication {
  name = profileName;

  runtimeInputs = [
    pi-coding-agent
    git
    gh
    glab
    nodejs
    bun
    ripgrep
    fd
    jq
    yq-go
    uv
    python3
    rtk
    graphify
    markitdown
    pandoc
    poppler-utils
    yt-dlp
  ];

  # The config repo is a git working tree, never a store symlink: pi merges
  # its own fields back into settings.json under a lock, so that file has to
  # stay writable.
  text = ''
    DIR="''${${dirEnvVar}:-$HOME/.${profileName}}"

    if [ ! -e "$DIR" ]; then
      echo "${profileName}: cloning ${configRepo} -> $DIR" >&2
      git clone "${configRepo}" "$DIR"
    elif [ -d "$DIR/.git" ] && [ -z "$(git -C "$DIR" status --porcelain)" ]; then
      # Clean tree only. A dirty tree keeps its local edits, always.
      git -C "$DIR" pull --ff-only --quiet \
        || echo "${profileName}: pull failed, using the local checkout" >&2
    fi

    export PI_CODING_AGENT_DIR="$DIR"
    exec pi "$@"
  '';

  meta = {
    description = "pi coding agent running the ${profileName} profile";
    homepage = "https://github.com/M4jor-Tom/${profileName}.app";
    mainProgram = profileName;
    platforms = lib.platforms.unix;
  };
}
```

- [ ] **Step 2: Write `flake.nix`**

```nix
{
  description = "pi coding agent, pre-loaded with the pi-power-dev profile";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    systems.url = "github:nix-systems/default";
  };

  outputs =
    { self
    , nixpkgs
    , systems
    }:
    let
      inherit (nixpkgs) lib;
      eachSystem = f: lib.foldl' lib.recursiveUpdate { } (map f (import systems));

      overlay = final: prev: {
        pi-power-dev = final.callPackage ./package.nix { };
      };
    in
    eachSystem
      (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          overlays = [ overlay ];
        };
      in
      {
        packages.${system} = {
          default = pkgs.pi-power-dev;
          pi-power-dev = pkgs.pi-power-dev;
        };

        apps.${system} = {
          default = {
            type = "app";
            program = "${pkgs.pi-power-dev}/bin/pi-power-dev";
          };
          pi-power-dev = {
            type = "app";
            program = "${pkgs.pi-power-dev}/bin/pi-power-dev";
          };
        };

        devShells.${system}.default = pkgs.mkShell {
          buildInputs = with pkgs; [ nixpkgs-fmt ];
        };
      }) // {
      overlays.default = overlay;
    };
}
```

- [ ] **Step 3: Build it and verify shellcheck passes**

`writeShellApplication` runs shellcheck at build time, so a build failure here is a lint failure in the wrapper.

Run: `cd ~/repos/pi-power-dev.app && nix build .#default 2>&1 | tail -20`

Expected: builds, `./result/bin/pi-power-dev` exists.

- [ ] **Step 4: Verify the wrapper resolves the right directory without cloning**

Point it at a directory that already exists, so the clone branch is skipped and only the export/exec path runs.

```bash
cd ~/repos/pi-power-dev.app
PI_POWER_DEV_DIR="$HOME/repos/pi-power-dev" ./result/bin/pi-power-dev --version
```

Expected: pi's version string. It must not clone, and must not touch `~/.pi-power-dev`.

- [ ] **Step 5: Verify `nix flake check`**

Run: `cd ~/repos/pi-power-dev.app && nix flake check 2>&1 | tail -20`

Expected: no errors.

- [ ] **Step 6: Write `README.md` and `.gitignore`**

Create `.gitignore`:

```gitignore
result
result-*
```

Create `README.md`:

````markdown
# pi-power-dev.app

Runs the [pi](https://pi.dev) coding agent against the
[`pi-power-dev`](https://github.com/M4jor-Tom/pi-power-dev) profile, and
supplies every CLI that profile's skills shell out to.

```bash
nix run github:M4jor-Tom/pi-power-dev.app
```

On first run it clones the profile to `~/.pi-power-dev`. On later runs it
fast-forwards that clone, but only when the tree is clean — local edits are
never clobbered. Override the location with `PI_POWER_DEV_DIR`.

This app is a convenience, not a requirement. The profile works on its own:

```bash
PI_CODING_AGENT_DIR=~/.pi-power-dev pi
```

## What it ships

`pi-coding-agent git gh glab nodejs bun ripgrep fd jq yq-go uv python3 rtk
graphify markitdown pandoc poppler-utils yt-dlp`

`nixpkgs#pi-coding-agent` already sets `PI_SKIP_VERSION_CHECK=1` and
`PI_TELEMETRY=0` and provides `rg`/`fd` to pi itself.

Two dependencies are deliberately absent. `playwright-driver` is not shipped
because the `playwright-cli` skill installs `@playwright/cli` through npm and
manages its own browsers. `graphify` is shipped at the nixpkgs version
(0.4.23) even though the skill pins 0.8.30 — `uv` is shipped alongside so the
skill's own `uv tool install --upgrade graphifyy` path can take over.
````

- [ ] **Step 7: Commit and push**

```bash
cd ~/repos/pi-power-dev.app
git add -A
git commit -m "feat: nix app running pi against the pi-power-dev profile"
git remote add origin https://github.com/M4jor-Tom/pi-power-dev.app.git
git push -u origin main
```

---

### Task 9: `pi-game-dev` — the profile

Everything from `pi-power-dev` plus the gamedev collections. The spec requires both profiles to carry the same authored artifacts, so this copies them rather than reimplementing.

**Files:**
- Create: `~/repos/pi-game-dev/` (copied from `pi-power-dev`, then extended)
- Create: `~/repos/pi-game-dev/skills/game-from-ontology/SKILL.md`
- Create: `~/repos/pi-game-dev/skills/ontology-resume-router-slice/{SKILL.md,handoff-template.md,phase-prompts.md}`
- Create: `~/repos/pi-game-dev/docs/adr/0003-skills-as-pinned-pi-packages.md`
- Modify: `~/repos/pi-game-dev/settings.json`
- Modify: `~/repos/pi-game-dev/AGENTS.md`
- Modify: `~/repos/pi-game-dev/README.md`

**Interfaces:**
- Consumes: the finished `pi-power-dev` tree from Task 7
- Produces: the `M4jor-Tom/pi-game-dev` repo

- [ ] **Step 1: Copy the shared profile**

`git archive` exports exactly the tracked files at HEAD — no `result`
symlinks, no ignored runtime state, and no inherited `pi-power-dev` history.

```bash
mkdir -p ~/repos/pi-game-dev
git -C ~/repos/pi-power-dev archive HEAD | tar -x -C ~/repos/pi-game-dev
cd ~/repos/pi-game-dev
rm -rf docs/superpowers
git init -b main
sh scripts/check.sh; echo "exit=$?"
```

Expected: `OK: agent dir is well-formed, 7 skills, 3 prompts, 10 agents`, `exit=0`. The spec and plan live in `pi-power-dev` only; `docs/adr/` is added below.

- [ ] **Step 2: Write the failing test**

In `scripts/check.sh`, raise the floors for this profile. Replace the two skill-floor lines with:

```sh
if [ "$skills" -lt 9 ]; then err "expected >= 9 skills, found $skills"; fi
if [ ! -f skills/context7/SKILL.md ]; then err "missing skills/context7/SKILL.md"; fi
if [ ! -f skills/game-from-ontology/SKILL.md ]; then
  err "missing skills/game-from-ontology/SKILL.md"
fi
if [ ! -f skills/ontology-resume-router-slice/SKILL.md ]; then
  err "missing skills/ontology-resume-router-slice/SKILL.md"
fi
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `cd ~/repos/pi-game-dev && sh scripts/check.sh; echo "exit=$?"`

Expected: `FAIL: expected >= 9 skills, found 7` plus the two missing-file failures, `exit=1`.

- [ ] **Step 4: Copy the two locally authored gamedev skills**

`ontology-resume-router-slice` is currently an untracked nested git repo inside `.claude-game-dev`. Copying the three files and dropping its `.git` is what removes that problem.

```bash
cd ~/repos/pi-game-dev
cp -RL "$HOME/.claude-game-dev/skills/game-from-ontology" skills/
cp -RL "$HOME/.claude-game-dev/skills/ontology-resume-router-slice" skills/
rm -rf skills/ontology-resume-router-slice/.git
ls skills/ontology-resume-router-slice/
```

Expected: `SKILL.md  handoff-template.md  phase-prompts.md` and no `.git`.

- [ ] **Step 5: Fix the skill name typo**

The frontmatter says `onthology-resume-router-slice` while the directory says `ontology-`. pi does not require them to match, but the typo is in the name the model sees.

```bash
cd ~/repos/pi-game-dev
sed -i 's/^name: onthology-resume-router-slice$/name: ontology-resume-router-slice/' \
  skills/ontology-resume-router-slice/SKILL.md
grep '^name:' skills/ontology-resume-router-slice/SKILL.md
```

Expected: `name: ontology-resume-router-slice`.

- [ ] **Step 6: Repoint the skill's internal path references**

`game-from-ontology` tells the reader to open `skills/ontology/SKILL.md` and `skills/router/SKILL.md`. Those now live under the gitignored `git/` tree, so name the skills instead of hardcoding paths.

```bash
cd ~/repos/pi-game-dev
sed -i \
  -e 's#`skills/ontology/SKILL\.md`#the `ontology` skill (`/skill:ontology`)#g' \
  -e 's#`skills/router/SKILL\.md`#the `router` skill (`/skill:router`)#g' \
  -e 's#skills/ontology/SKILL\.md#the ontology skill#g' \
  -e 's#skills/router/SKILL\.md#the router skill#g' \
  skills/game-from-ontology/SKILL.md skills/ontology-resume-router-slice/SKILL.md
grep -n 'skills/ontology/SKILL\.md\|skills/router/SKILL\.md' \
  skills/game-from-ontology/SKILL.md skills/ontology-resume-router-slice/SKILL.md \
  || echo "no hardcoded paths left"
```

Expected: `no hardcoded paths left`.

- [ ] **Step 7: Add the gamedev packages and the model pin**

Modify `settings.json`: add `defaultProvider`/`defaultModel` at the top, and append two package entries. The `awesome-gamedev-agent-skills` entry needs an explicit filter because `router/` sits at the repo root, outside the `skills/` directory convention discovery scans.

Add before `"defaultThinkingLevel"`:

```json
  "defaultProvider": "anthropic",
  "defaultModel": "claude-fable-5-1[1m]",
```

Append to `packages`:

```json
    {
      "source": "git:github.com/gamedev-skills/awesome-gamedev-agent-skills@9ca5296b219049c5b68494e1f3c274ead6d727b3",
      "skills": ["skills", "router"],
      "extensions": [],
      "prompts": [],
      "themes": []
    },
    "git:github.com/M4jor-Tom/claude-ontology-skill@13bfe0ce8c46fbd3d77e9faf94ebeb6ba4f5bab3"
```

- [ ] **Step 8: Append the ontology policy to `AGENTS.md`**

Add at the end of `AGENTS.md`. The power-dev policy above it is unchanged; this is `~/.claude-game-dev/CLAUDE.md`, which was already written in English.

```markdown
## Ontology-first game development

This profile develops game repositories ontology-first.

- Every gameplay feature starts with `/skill:game-from-ontology`, which
  chains the `ontology` and `router` skills.
- `ontology/` at the repo root is the source of truth. Development never
  drifts ahead of it.
- **Sync rule (step 0):** land the change in `ontology/` before implementing
  any domain-touching task. Skip only for debugging, build or tooling work.
- Always route gamedev implementation through the `router` skill. Never
  hand-pick engine or genre skills yourself.
- **Exemption:** `prototype-fast` spikes and `game-jam` builds are
  pre-ontology, timeboxed, on a separate branch or repo, and never merged. A
  spike that proves fun feeds the ontology; its code is deleted.
- To resume work on an existing ontology-first repo, use
  `/skill:ontology-resume-router-slice`. It expects the `subagent` tool for
  its per-phase model routing.
```

- [ ] **Step 9: Copy the ADRs and record the mechanism change**

```bash
cd ~/repos/pi-game-dev
mkdir -p docs/adr
cp "$HOME/.claude-game-dev/docs/adr/"*.md docs/adr/
ls docs/adr/
```

Create `docs/adr/0003-skills-as-pinned-pi-packages.md`:

```markdown
# 3. Skills as pinned pi packages, not submodules with symlinks

Date: 2026-09-12

## Status

Accepted. Supersedes ADR 0002 for this repository.

## Context

ADR 0002 chose git submodules under `vendor/` plus 69 relative symlinks in
`skills/`, because Claude Code only looks one level deep for `SKILL.md` and
the upstream collection nests skills by category.

Two things changed when this profile moved to pi:

1. **pi's skill discovery recurses to unlimited depth**, stopping at the
   first directory containing `SKILL.md`. One path covers all 67 gamedev
   skills. Every symlink ADR 0002 introduced exists only to work around a
   limitation pi does not have.
2. **pi has a package manager whose manifest is `settings.json`.** A pinned
   `git:host/user/repo@sha` entry is cloned into the gitignored `git/`
   subtree at startup and reconciled by `pi update --extensions`.

## Decision

Carry third-party skill collections as pinned `packages[]` entries. Delete
the `vendor/` submodules and all 69 symlinks.

Locally authored skills stay as plain directories under `skills/`. That
includes `ontology-resume-router-slice`, which was an untracked nested git
repository — copying its three files removes a repo-inside-a-repo that git
never handled cleanly.

## Consequences

- A clone is text-only and small. `--recursive` is no longer needed.
- Nothing on disk is a symlink, so the Windows `core.symlinks` caveat from
  ADR 0002 is gone, as is the class of broken-symlink failures
  `scripts/check.sh` was written to catch.
- `check.sh` can no longer count vendored skills: after pi installs them they
  live under the gitignored `git/` tree. It now checks the authored skills
  and asserts every package source is pinned.
- Dependabot's `gitsubmodule` ecosystem no longer applies. Bumping an upstream
  means editing a ref in `settings.json`, which is a reviewable one-line diff
  rather than an opaque gitlink change.
- The first run after a fresh clone needs network access to install packages.
```

- [ ] **Step 10: Drop the obsolete Dependabot config and adapt the README**

```bash
cd ~/repos/pi-game-dev
rm -f .github/dependabot.yml
```

Rename throughout, then replace the two-line description:

```bash
cd ~/repos/pi-game-dev
sed -i -e 's/pi-power-dev/pi-game-dev/g' -e 's/PI_POWER_DEV_DIR/PI_GAME_DEV_DIR/g' README.md
sed -i '/^A \[pi\](https:\/\/pi\.dev) agent directory: general-purpose coding profile,$/,+1c\
A [pi](https://pi.dev) agent directory: everything in `pi-power-dev`, plus\
ontology-first game development. Ported from `M4jor-Tom/claude-game-dev`.\
\
The 69 symlinks and two `vendor/` submodules the Claude profile carried are\
gone — see `docs/adr/0003-skills-as-pinned-pi-packages.md`.' README.md
head -12 README.md
```

Expected: title `# pi-game-dev`, then the new description. Verify no
`pi-power-dev` or `PI_POWER_DEV_DIR` remains except inside the new
description's backticked reference:

```bash
grep -n 'PI_POWER_DEV_DIR' README.md || echo "no stale env var"
```

Expected: `no stale env var`.

- [ ] **Step 11: Run the test to verify it passes**

Run: `cd ~/repos/pi-game-dev && sh scripts/check.sh; echo "exit=$?"`

Expected: `OK: agent dir is well-formed, 9 skills, 3 prompts, 10 agents`, `exit=0`.

- [ ] **Step 12: Commit and push**

```bash
cd ~/repos/pi-game-dev
git add -A
git commit -m "feat: ontology-first gamedev profile on top of the shared base"
git remote add origin https://github.com/M4jor-Tom/pi-game-dev.git
git push -u origin main
```

---

### Task 10: `pi-game-dev.app` — the Nix app

Reuses Task 8's `package.nix` verbatim, with different arguments.

**Files:**
- Create: `~/repos/pi-game-dev.app/flake.nix`
- Create: `~/repos/pi-game-dev.app/package.nix` (copied from Task 8)
- Create: `~/repos/pi-game-dev.app/README.md`
- Create: `~/repos/pi-game-dev.app/.gitignore`

**Interfaces:**
- Consumes: the `M4jor-Tom/pi-game-dev` repo from Task 9, and Task 8's `package.nix`
- Produces: `apps.<system>.default` running `bin/pi-game-dev`

- [ ] **Step 1: Create the repo and copy `package.nix` unchanged**

```bash
mkdir -p ~/repos/pi-game-dev.app && cd ~/repos/pi-game-dev.app && git init -b main
cp ~/repos/pi-power-dev.app/package.nix .
cp ~/repos/pi-power-dev.app/.gitignore .
```

`package.nix` is parameterised, so it needs no edits — only the overlay
passes different values.

- [ ] **Step 2: Write `flake.nix`**

```nix
{
  description = "pi coding agent, pre-loaded with the pi-game-dev profile";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    systems.url = "github:nix-systems/default";
  };

  outputs =
    { self
    , nixpkgs
    , systems
    }:
    let
      inherit (nixpkgs) lib;
      eachSystem = f: lib.foldl' lib.recursiveUpdate { } (map f (import systems));

      overlay = final: prev: {
        pi-game-dev = final.callPackage ./package.nix {
          profileName = "pi-game-dev";
          configRepo = "https://github.com/M4jor-Tom/pi-game-dev.git";
          dirEnvVar = "PI_GAME_DEV_DIR";
        };
      };
    in
    eachSystem
      (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          overlays = [ overlay ];
        };
      in
      {
        packages.${system} = {
          default = pkgs.pi-game-dev;
          pi-game-dev = pkgs.pi-game-dev;
        };

        apps.${system} = {
          default = {
            type = "app";
            program = "${pkgs.pi-game-dev}/bin/pi-game-dev";
          };
          pi-game-dev = {
            type = "app";
            program = "${pkgs.pi-game-dev}/bin/pi-game-dev";
          };
        };

        devShells.${system}.default = pkgs.mkShell {
          buildInputs = with pkgs; [ nixpkgs-fmt ];
        };
      }) // {
      overlays.default = overlay;
    };
}
```

- [ ] **Step 3: Build and verify**

Run: `cd ~/repos/pi-game-dev.app && nix build .#default && ./result/bin/pi-game-dev --version`

Expected: builds, and pi prints its version. The binary must be named
`pi-game-dev`, not `pi-power-dev` — if it is the latter, the overlay is not
passing `profileName`.

- [ ] **Step 4: Verify the directory default changed**

```bash
cd ~/repos/pi-game-dev.app
grep -o 'PI_GAME_DEV_DIR:-[^}]*' ./result/bin/pi-game-dev
```

Expected: `PI_GAME_DEV_DIR:-$HOME/.pi-game-dev`.

- [ ] **Step 5: Run `nix flake check`**

Run: `cd ~/repos/pi-game-dev.app && nix flake check 2>&1 | tail -20`

Expected: no errors.

- [ ] **Step 6: Write `README.md`**

```bash
cd ~/repos/pi-game-dev.app
cp ~/repos/pi-power-dev.app/README.md .
sed -i -e 's/pi-power-dev/pi-game-dev/g' -e 's/PI_POWER_DEV_DIR/PI_GAME_DEV_DIR/g' README.md
sed -i 's|^\[`pi-game-dev`\](https://github.com/M4jor-Tom/pi-game-dev) profile, and$|[`pi-game-dev`](https://github.com/M4jor-Tom/pi-game-dev) profile — the shared\
base plus ontology-first game development — and|' README.md
head -8 README.md
grep -n 'PI_POWER_DEV_DIR\|pi-power-dev' README.md || echo "no stale references"
```

Expected: the header reads `# pi-game-dev.app`, the description mentions
ontology-first game development, and `no stale references`.

- [ ] **Step 7: Commit and push**

```bash
cd ~/repos/pi-game-dev.app
git add -A
git commit -m "feat: nix app running pi against the pi-game-dev profile"
git remote add origin https://github.com/M4jor-Tom/pi-game-dev.app.git
git push -u origin main
```

---

### Task 11: End-to-end acceptance

Everything so far is offline and structural. This runs both profiles for real.

**Files:**
- Modify: `~/repos/pi-power-dev/README.md` (record anything that did not work)

**Interfaces:**
- Consumes: all four repos

- [ ] **Step 1: Clean-slate clone and start**

```bash
rm -rf ~/.pi-power-dev
nix run ~/repos/pi-power-dev.app -- --version
```

Expected: a clone line on stderr, then pi's version. `~/.pi-power-dev/settings.json` now exists.

- [ ] **Step 2: Verify packages installed and resolved**

```bash
PI_CODING_AGENT_DIR=~/.pi-power-dev nix run ~/repos/pi-power-dev.app -- list
ls ~/.pi-power-dev/git ~/.pi-power-dev/npm
```

Expected: the seven package sources listed; `git/github.com/obra/superpowers` and `npm/` populated.

- [ ] **Step 3: Verify skills, prompts and tools are live**

Ask the user to run `nix run ~/repos/pi-power-dev.app` and, in the session, confirm each of:

1. The startup header lists loaded context files, prompt templates, skills and extensions.
2. `/skill:brainstorming` completes — superpowers loaded from its package.
3. Ponytail reports its mode at session start — its pi extension loaded.
4. `/simplify` appears in `/` autocomplete.
5. `memory_search` is offered as a tool — pi-hermes-memory loaded.
6. `subagent` is offered as a tool, and it lists the ten `understand-*` agents.
7. `mcp` is offered as a tool — pi-mcp-adapter loaded.

- [ ] **Step 4: Verify the rtk rewrite fires in a live session**

In the same session, ask pi to run `git status` via its bash tool, then check
what actually executed:

```bash
grep -o '"command":"[^"]*"' "$(ls -t ~/.pi-power-dev/sessions/*/*.jsonl | head -1)" | tail -5
```

Expected: `"command":"rtk git status"`, not `"command":"git status"`.

- [ ] **Step 5: Verify the guard blocks**

Ask pi to run `terraform destroy`. Expected: the tool call is blocked with
`terraform destroy is denied by this pi profile.` and nothing executes.

- [ ] **Step 6: Verify per-profile isolation and a clean tree**

```bash
ls ~/.pi-power-dev/auth.json ~/.pi-power-dev/sessions ~/.pi-power-dev/pi-hermes-memory
git -C ~/.pi-power-dev status --porcelain
```

Expected: the three paths exist; `git status --porcelain` prints nothing. Anything printed is a `.gitignore` gap — fix it in `pi-power-dev/.gitignore` and commit before continuing.

- [ ] **Step 7: Verify it works with no Nix at all**

```bash
PI_CODING_AGENT_DIR=~/.pi-power-dev "$(nix build --no-link --print-out-paths nixpkgs#pi-coding-agent)/bin/pi" --version
```

Expected: the same version. This is the "usable outside of nix" requirement.

- [ ] **Step 8: Repeat Steps 1-7 for `pi-game-dev`**

```bash
rm -rf ~/.pi-game-dev
nix run ~/repos/pi-game-dev.app -- --version
```

Additionally confirm in a live session:

1. `/skill:router` and `/skill:ontology` resolve — the two gamedev packages installed and pi recursed into their nested category directories.
2. `/skill:game-from-ontology` and `/skill:ontology-resume-router-slice` resolve.
3. The footer shows the pinned model.

- [ ] **Step 9: Verify the pull path does not clobber local edits**

```bash
echo "# scratch" >> ~/.pi-power-dev/AGENTS.md
nix run ~/repos/pi-power-dev.app -- --version
tail -1 ~/.pi-power-dev/AGENTS.md
```

Expected: `# scratch` survives — the dirty tree skipped the pull. Then clean up:

```bash
git -C ~/.pi-power-dev checkout AGENTS.md
```

- [ ] **Step 10: Record any deviation and commit**

If any step needed a fix, apply it in the relevant repo, re-run `scripts/check.sh` there, and commit. If a step revealed something that cannot be fixed now, add it to `pi-power-dev/README.md` under a `## Known issues` heading rather than leaving it undocumented.

```bash
cd ~/repos/pi-power-dev
git add -A && git commit -m "docs: record end-to-end acceptance results" && git push
```
