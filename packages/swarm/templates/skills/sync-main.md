# Skill: Sync Main Branch

Ensure the local `main` branch is up-to-date with the remote before starting any work. This prevents agents from operating on stale code when the scheduler creates a worktree from `main`.

## Steps

### 1. Fetch and Merge Remote Main

```bash
git fetch origin main && git merge origin/main --ff-only
```

The `--ff-only` flag ensures a clean fast-forward. If the merge fails (e.g., local commits on main that diverge from origin), report the error and STOP — do not proceed with stale or conflicted state.

### 2. Confirm Sync

Report the current HEAD:

```bash
git log --oneline -1
```

## Rules

- This skill MUST run before any other skill in scheduled task workflows
- If the fetch or merge fails, STOP — do not proceed with stale code
- Never force-push or reset main — only fast-forward merges are allowed
