#!/bin/bash
# Smoke tests for the Go kernel binary
set -e
export PATH="/home/jared/.local/go/bin:$PATH"
BIN="$(dirname "$0")/../bin/agentguard"
POLICY="$(dirname "$0")/../../agentguard.yaml"

echo "=== Test 1: file read (raw tool call format — expect allowed) ==="
result=$(printf '{"tool":"Read","input":{"file_path":"/tmp/t.txt"}}' | "$BIN" evaluate --policy "$POLICY" 2>&1) || true
echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['allowed'], 'expected allowed'; print('allowed:', d['allowed'])"

echo "=== Test 2: normalize gh pr create ==="
printf '{"tool":"Bash","input":{"command":"gh pr create --title fix"}}' | "$BIN" normalize 2>&1 | python3 -c "import sys,json; d=json.load(sys.stdin); print('action:', d['action'], 'class:', d['actionClass'])"

echo "=== Test 3: rm -rf (raw tool call format — expect denied) ==="
result=$(printf '{"tool":"Bash","input":{"command":"rm -rf /tmp/x"}}' | "$BIN" evaluate --policy "$POLICY" 2>&1) || true
echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); assert not d['allowed'], 'expected denied'; print('allowed:', d['allowed'])"

echo "=== Test 4: file.write pre-normalized ActionContext format (expect allowed) ==="
# Regression test for: https://github.com/AgentGuardHQ/agent-guard/issues/957
# The evaluate command must accept pre-normalized {action,target} payloads in
# addition to raw {tool,input} payloads.
result=$(printf '{"action":"file.write","target":"foo.ts"}' | "$BIN" evaluate --policy "$POLICY" 2>&1) || true
echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['allowed'], 'expected allowed for pre-normalized file.write (issue #957)'; print('allowed:', d['allowed'])"

echo "=== Test 5: normalize | evaluate pipeline (expect allowed) ==="
result=$(printf '{"tool":"Write","input":{"file_path":"src/main.ts"}}' | "$BIN" normalize | "$BIN" evaluate --policy "$POLICY" 2>&1) || true
echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); assert d['allowed'], 'expected allowed for normalize|evaluate pipeline'; print('allowed:', d['allowed'])"

echo "=== All smoke tests passed ==="
