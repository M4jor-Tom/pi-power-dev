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
if [ "$skills" -lt 6 ]; then err "expected >= 6 skills, found $skills"; fi

if [ "$fail" -eq 0 ]; then echo "OK: agent dir is well-formed, $skills skills"; fi
exit "$fail"
