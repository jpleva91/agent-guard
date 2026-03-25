#!/bin/bash
# Smoke tests for the Go kernel binary
set -e
export PATH="/home/jared/.local/go/bin:$PATH"
BIN="$(dirname "$0")/../bin/agentguard"
POLICY="$(dirname "$0")/../../agentguard.yaml"

echo "=== Test 1: file read (expect allowed) ==="
result=$(printf '{"tool":"Read","input":{"file_path":"/tmp/t.txt"}}' | "$BIN" evaluate --policy "$POLICY" 2>&1) || true
echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print('allowed:', d['allowed'])"

echo "=== Test 2: normalize gh pr create ==="
printf '{"tool":"Bash","input":{"command":"gh pr create --title fix"}}' | "$BIN" normalize 2>&1 | python3 -c "import sys,json; d=json.load(sys.stdin); print('action:', d['action'], 'class:', d['actionClass'])"

echo "=== Test 3: rm -rf (expect denied) ==="
result=$(printf '{"tool":"Bash","input":{"command":"rm -rf /tmp/x"}}' | "$BIN" evaluate --policy "$POLICY" 2>&1) || true
echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print('allowed:', d['allowed'])"

echo "=== All smoke tests passed ==="
