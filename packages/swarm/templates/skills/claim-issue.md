# Skill: Claim Issue

Claim a discovered GitHub issue for the current agent session. Updates labels, creates a working branch, and posts a start comment.

## Prerequisites

Run `discover-next-issue` first to identify the issue number.

## Steps

### 1. Update Issue Status

Remove the pending label and mark as in-progress:

```bash
gh issue edit <ISSUE_NUMBER> --remove-label "<%= labels.pending %>" --add-label "<%= labels.inProgress %>"
```

If label update fails because the label does not exist on the repository, create it first:

```bash
gh label create "<%= labels.inProgress %>" --color "0E8A16" --description "Agent is actively working on this"
```

Then retry the edit command.

### 2. Determine Branch Name

Map the task type label to a branch prefix:

| Label | Branch Prefix |
|-------|--------------|
| `task:implementation` | `agent/implementation/issue-<N>` |
| `task:bug-fix` | `agent/bugfix/issue-<N>` |
| `task:refactor` | `agent/refactor/issue-<N>` |
| `task:test-generation` | `agent/tests/issue-<N>` |
| `task:documentation` | `agent/docs/issue-<N>` |
| (default) | `agent/task/issue-<N>` |

### 3. Create Working Branch

```bash
git checkout -b agent/<type>/issue-<ISSUE_NUMBER>
```

If the branch already exists (from a previous attempt):

```bash
git checkout agent/<type>/issue-<ISSUE_NUMBER>
```

### 4. Verify Branch

```bash
git branch --show-current
```

Confirm the output matches the expected branch name.

### 5. Post Start Comment

```bash
gh issue comment <ISSUE_NUMBER> --body "**AgentGuard Agent** — work started.

- **Branch**: \`agent/<type>/issue-<ISSUE_NUMBER>\`
- **Governance**: Active (PreToolUse hooks enforcing policy)
- **Started**: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

## Rules

- If the branch already exists, check it out instead of creating a new one
- Always verify you are on the correct branch before proceeding
- If the issue is already `status:in-progress`, check if it was previously assigned — if so, resume work on the existing branch rather than starting fresh
- Do not claim more than one issue at a time
