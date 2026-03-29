#!/usr/bin/env bash
# check-site-stats.sh — Compare site/index.html numeric claims against codebase sources.
#
# Checks every place a numeric count appears in site/index.html:
#   - stat bar data-target counters
#   - <meta> description / og:description / JSON-LD description
#   - Hero paragraph
#   - Feature card headings
#   - Pipeline Emit stage label
#   - Inline architecture detail text
#
# Exit codes:
#   0 — all claims match codebase
#   1 — one or more claims are stale
#
# Usage: bash scripts/check-site-stats.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SITE="$ROOT/site/index.html"

PASS=0
FAIL=0

ok()    { echo "  ✓ $1"; }
drift() { echo "  ✗ $1: site says $2, codebase has $3"; FAIL=$((FAIL + 1)); }

echo "Site stats check"
echo ""

# ---------------------------------------------------------------------------
# 1. Count sources of truth from the codebase
# ---------------------------------------------------------------------------

# Event kinds: lines matching '^export const.*EventKind' in schema.ts
SCHEMA="$ROOT/packages/events/src/schema.ts"
ACTUAL_EVENTS=$(grep -c '^export const.*EventKind' "$SCHEMA" 2>/dev/null || echo 0)

# Invariants: 4-space-indented "name: '" lines — one per top-level invariant object.
# Sub-pattern objects nested inside invariants also use "id:", but only the
# top-level AgentGuardInvariant objects have a "name:" field at this indent.
DEFS="$ROOT/packages/invariants/src/definitions.ts"
ACTUAL_INVARIANTS=$(grep -c "^    name: '" "$DEFS" 2>/dev/null || echo 0)

# Destructive patterns: occurrences of '"pattern"' key in destructive-patterns.json
DESTR="$ROOT/packages/core/src/data/destructive-patterns.json"
ACTUAL_PATTERNS=$(grep -c '"pattern"' "$DESTR" 2>/dev/null || echo 0)

# Action types: count top-level keys in the "types" object of actions.json
ACTIONS="$ROOT/packages/core/src/data/actions.json"
ACTUAL_ACTIONS=$(node -e "
  const d = JSON.parse(require('fs').readFileSync('$ACTIONS', 'utf8'));
  const types = d.types || d;
  console.log(Object.keys(types).length);
" 2>/dev/null || echo 0)

# CLI commands: count .ts files in apps/cli/src/commands/, minus known
# subcommand implementation files (cloud-login.ts, policy-verify.ts) that are
# not top-level commands.
CMDS_DIR="$ROOT/apps/cli/src/commands"
TOTAL_CMD_FILES=$(ls "$CMDS_DIR"/*.ts 2>/dev/null | wc -l | tr -d ' ')
SUBCMD_FILES=$(ls "$CMDS_DIR"/*.ts 2>/dev/null | grep -c 'cloud-login\.ts\|policy-verify\.ts' || true)
ACTUAL_CMDS=$((TOTAL_CMD_FILES - SUBCMD_FILES))

# ---------------------------------------------------------------------------
# 2. Helpers to extract values from site/index.html
# ---------------------------------------------------------------------------

# Extract the data-target value whose immediately following label div contains
# EXACTLY $1 as its text content (">LABEL<" match to avoid picking up card
# headings or pipeline stage labels that also contain the same word).
# Stops after the first match — the stat bar counter is the canonical location.
stat_bar_value() {
  local label="$1"
  # Each stat block is: <div ... data-target="N">0</div>\n<div ...>LABEL</div>
  # Match ">LABEL<" so we only hit the stat bar label div, not prose/headings.
  awk -v lbl="$label" '
    /data-target="[0-9]+"/ { prev = $0 }
    !found && index($0, ">" lbl "<") && prev != "" {
      match(prev, /data-target="([0-9]+)"/, arr)
      print arr[1]
      prev = ""
      found = 1
    }
  ' "$SITE"
}

# Extract the first occurrence of a number N in lines matching pattern
first_number_in() {
  local pattern="$1"
  grep -o "$pattern" "$SITE" | grep -o '[0-9]\+' | head -1
}

# ---------------------------------------------------------------------------
# 3. Stat bar checks
# ---------------------------------------------------------------------------
echo "--- Stat bar (data-target) ---"

SITE_EVENTS=$(stat_bar_value "Event Kinds")
SITE_INVARIANTS=$(stat_bar_value "Invariants")
SITE_PATTERNS=$(stat_bar_value "Destructive Patterns")
SITE_ACTIONS=$(stat_bar_value "Action Types")
SITE_CMDS=$(stat_bar_value "CLI Commands")

if [ "$SITE_EVENTS" = "$ACTUAL_EVENTS" ]; then
  ok "Event Kinds: $ACTUAL_EVENTS"
else
  drift "Event Kinds (stat bar)" "$SITE_EVENTS" "$ACTUAL_EVENTS"
fi

if [ "$SITE_INVARIANTS" = "$ACTUAL_INVARIANTS" ]; then
  ok "Invariants: $ACTUAL_INVARIANTS"
else
  drift "Invariants (stat bar)" "$SITE_INVARIANTS" "$ACTUAL_INVARIANTS"
fi

if [ "$SITE_PATTERNS" = "$ACTUAL_PATTERNS" ]; then
  ok "Destructive Patterns: $ACTUAL_PATTERNS"
else
  drift "Destructive Patterns (stat bar)" "$SITE_PATTERNS" "$ACTUAL_PATTERNS"
fi

if [ "$SITE_ACTIONS" = "$ACTUAL_ACTIONS" ]; then
  ok "Action Types: $ACTUAL_ACTIONS"
else
  drift "Action Types (stat bar)" "$SITE_ACTIONS" "$ACTUAL_ACTIONS"
fi

if [ "$SITE_CMDS" = "$ACTUAL_CMDS" ]; then
  ok "CLI Commands: $ACTUAL_CMDS"
else
  drift "CLI Commands (stat bar)" "$SITE_CMDS" "$ACTUAL_CMDS"
fi

# ---------------------------------------------------------------------------
# 4. Meta / JSON-LD / og:description — invariant count
# ---------------------------------------------------------------------------
echo ""
echo "--- Meta tags / JSON-LD ---"

# <meta name="description"> — "24 invariants"
META_DESC_INV=$(grep -o 'name="description"[^>]*content="[^"]*"' "$SITE" \
  | grep -o '[0-9]\+ invariants' | grep -o '[0-9]\+' | head -1)
if [ "$META_DESC_INV" = "$ACTUAL_INVARIANTS" ]; then
  ok "meta[description] invariant count: $ACTUAL_INVARIANTS"
else
  drift "meta[description] invariant count" "$META_DESC_INV" "$ACTUAL_INVARIANTS"
fi

# <meta property="og:description"> — "24 invariants"
OG_DESC_INV=$(grep -o 'property="og:description"[^>]*content="[^"]*"' "$SITE" \
  | grep -o '[0-9]\+ invariants' | grep -o '[0-9]\+' | head -1)
if [ "$OG_DESC_INV" = "$ACTUAL_INVARIANTS" ]; then
  ok "og:description invariant count: $ACTUAL_INVARIANTS"
else
  drift "og:description invariant count" "$OG_DESC_INV" "$ACTUAL_INVARIANTS"
fi

# JSON-LD "description" — "24 invariants"
JSONLD_INV=$(grep -A1 '"description":' "$SITE" | grep -o '[0-9]\+ invariants' | grep -o '[0-9]\+' | head -1)
if [ "$JSONLD_INV" = "$ACTUAL_INVARIANTS" ]; then
  ok "JSON-LD description invariant count: $ACTUAL_INVARIANTS"
else
  drift "JSON-LD description invariant count" "$JSONLD_INV" "$ACTUAL_INVARIANTS"
fi

# ---------------------------------------------------------------------------
# 5. Hero paragraph — "24 built-in safety checks"
# ---------------------------------------------------------------------------
echo ""
echo "--- Hero paragraph ---"

HERO_INV=$(grep -o '[0-9]\+ built-in safety checks' "$SITE" | grep -o '[0-9]\+' | head -1)
if [ "$HERO_INV" = "$ACTUAL_INVARIANTS" ]; then
  ok "Hero 'built-in safety checks' count: $ACTUAL_INVARIANTS"
else
  drift "Hero 'built-in safety checks' count" "$HERO_INV" "$ACTUAL_INVARIANTS"
fi

# ---------------------------------------------------------------------------
# 6. Feature card headings
# ---------------------------------------------------------------------------
echo ""
echo "--- Feature card headings ---"

# Card heading: "24 Safety Invariants" (exclude HTML comments — stale comments
# may contain an old number, e.g. "<!-- Card 1: 8 Safety Invariants -->")
CARD_INV=$(grep -v '<!--' "$SITE" | grep -o '[0-9]\+ Safety Invariants' | grep -o '[0-9]\+' | head -1)
if [ "$CARD_INV" = "$ACTUAL_INVARIANTS" ]; then
  ok "Card heading 'Safety Invariants' count: $ACTUAL_INVARIANTS"
else
  drift "Card heading 'Safety Invariants' count" "$CARD_INV" "$ACTUAL_INVARIANTS"
fi

# Card heading: "93 Destructive Patterns"
CARD_PATTERNS=$(grep -o '[0-9]\+ Destructive Patterns' "$SITE" | grep -o '[0-9]\+' | head -1)
if [ "$CARD_PATTERNS" = "$ACTUAL_PATTERNS" ]; then
  ok "Card heading 'Destructive Patterns' count: $ACTUAL_PATTERNS"
else
  drift "Card heading 'Destructive Patterns' count" "$CARD_PATTERNS" "$ACTUAL_PATTERNS"
fi

# Card body: "48 event kinds"
CARD_EVENTS=$(grep -o '[0-9]\+ event kinds' "$SITE" | grep -o '[0-9]\+' | head -1)
if [ "$CARD_EVENTS" = "$ACTUAL_EVENTS" ]; then
  ok "Card body 'event kinds' count: $ACTUAL_EVENTS"
else
  drift "Card body 'event kinds' count" "$CARD_EVENTS" "$ACTUAL_EVENTS"
fi

# ---------------------------------------------------------------------------
# 7. Pipeline Emit stage — "48 event kinds"
# ---------------------------------------------------------------------------
echo ""
echo "--- Pipeline Emit stage ---"

# The emit stage has a label: "48 event kinds"
PIPELINE_EVENTS=$(grep -A5 'Stage 7: Emit' "$SITE" | grep -o '[0-9]\+ event kinds' | grep -o '[0-9]\+' | head -1)
if [ "$PIPELINE_EVENTS" = "$ACTUAL_EVENTS" ]; then
  ok "Pipeline Emit 'event kinds' count: $ACTUAL_EVENTS"
else
  drift "Pipeline Emit 'event kinds' count" "$PIPELINE_EVENTS" "$ACTUAL_EVENTS"
fi

# ---------------------------------------------------------------------------
# 8. Architecture detail text — "41 canonical action types"
# ---------------------------------------------------------------------------
echo ""
echo "--- Architecture detail text ---"

ARCH_ACTIONS=$(grep -o '[0-9]\+ canonical action types' "$SITE" | grep -o '[0-9]\+' | head -1)
if [ "$ARCH_ACTIONS" = "$ACTUAL_ACTIONS" ]; then
  ok "Architecture detail 'canonical action types' count: $ACTUAL_ACTIONS"
else
  drift "Architecture detail 'canonical action types' count" "$ARCH_ACTIONS" "$ACTUAL_ACTIONS"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
TOTAL=$((PASS + FAIL))
if [ "$FAIL" -eq 0 ]; then
  echo "All checks passed — site/index.html is in sync with codebase."
  exit 0
else
  echo "$FAIL drift(s) detected — update site/index.html to match codebase sources."
  echo ""
  echo "Sources of truth:"
  echo "  Event kinds   : grep -c '^export const.*EventKind' packages/events/src/schema.ts"
  echo "  Invariants    : grep -c \"^    name: '\" packages/invariants/src/definitions.ts"
  echo "  Destr. patterns: grep -c '\"pattern\"' packages/core/src/data/destructive-patterns.json"
  echo "  Action types  : .types keys in packages/core/src/data/actions.json"
  echo "  CLI commands  : ls apps/cli/src/commands/*.ts | wc -l (minus subcommand files)"
  exit 1
fi
