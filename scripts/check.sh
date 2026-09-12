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
if [ "$skills" -lt 7 ]; then err "expected >= 7 skills, found $skills"; fi
if [ ! -f skills/context7/SKILL.md ]; then err "missing skills/context7/SKILL.md"; fi

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

# Every package source must be pinned to something immutable. packages[] is
# the only manifest pi has, and a floating ref (@main, @latest) silently
# changes what the profile loads between runs.
unpinned=$(jq -r '
  .packages // []
  | map(if type == "string" then . else .source end)
  | map(select(
      (startswith("npm:") and (test("@[0-9]+(\\.[0-9]+)*$") | not))
      or (startswith("git:") and (test("@([0-9a-f]{40}|v?[0-9]+(\\.[0-9]+)*)$") | not))
    ))
  | .[]' settings.json 2>/dev/null || true)
if [ -n "$unpinned" ]; then
  err "unpinned package source(s): $(echo "$unpinned" | tr '\n' ' ')"
fi

# The MCP servers mcp.json declares are only reachable if the adapter is pinned.
if jq -e '.mcpServers | length > 0' mcp.json >/dev/null 2>&1; then
  if ! jq -e '
    (.packages // [])
    | map(if type == "string" then . else .source end)
    | any(test("^npm:pi-mcp-adapter@"))' settings.json >/dev/null 2>&1; then
    err "mcp.json declares servers but pi-mcp-adapter is not in packages[]"
  fi
fi

if [ "$fail" -eq 0 ]; then
  echo "OK: agent dir is well-formed, $skills skills, $prompts prompts"
fi
exit "$fail"
