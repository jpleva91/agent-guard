# Dolt Use Cases for Agentic AI

Dolt is a MySQL-compatible SQL database with Git-style version control built in. Every write is tracked, every table can be branched, diffed, merged, and rolled back. This combination of structured querying and full version history makes Dolt particularly well-suited to agentic AI workloads where audit trails, safe experimentation, and multi-agent coordination are essential.

The use cases below document real-world patterns for using Dolt with AI agent systems.

## Overview

| Use Case | Core Capability | Source |
|---|---|---|
| Cursor for Everything | Branch-based preview-before-commit | [Blog](https://www.dolthub.com/blog/2025-11-19-cursor-for-everything/) |
| Agentic Memory | Externalized task management across sessions | [Blog](https://www.dolthub.com/blog/2026-01-22-agentic-memory/) |
| Multi-Agent Persistence | Concurrent agent data at scale | [Blog](https://www.dolthub.com/blog/2026-03-13-multi-agent-persistence/) |
| Version Control for Agent Data | Git-style branch/diff/rollback for data | [Blog](https://www.dolthub.com/blog/2025-09-08-agentic-ai-three-pillars/#version-control) |
| EU AI Act Compliance | Queryable audit trail for regulation | [Blog](https://www.dolthub.com/blog/2026-02-02-eu-ai-act/) |

## 1. Cursor for Everything

Cursor popularized the pattern of an LLM proposing code changes that developers review before accepting. Dolt enables the same workflow for any database-backed application. When an LLM modifies data, it writes to a Dolt branch rather than the production state. Users see a diff of proposed changes and choose to merge or discard — the same review loop developers use for code.

The Dolt Workbench extends this with **Agent Mode**: an AI chat interface that operates directly on databases. The agent executes SQL queries and modifications while Dolt tracks every change. Users see an "uncommitted changes" view with modified rows highlighted, and the agent holds off on committing until the user grants explicit confirmation. This works with Dolt, MySQL, and PostgreSQL databases, though the version control benefits are specific to Dolt.

Key concepts:
- Database branches as preview environments for LLM-proposed changes
- Merge-on-approval workflow analogous to pull requests
- Transparent tool call visibility (users see the exact SQL executed)
- One-click rollback via Dolt's commit history

Sources: [Cursor for Everything](https://www.dolthub.com/blog/2025-11-19-cursor-for-everything/), [Introducing Agent Mode](https://www.dolthub.com/blog/2026-02-09-introducing-agent-mode/)

## 2. Agentic Memory (Beads & Gastown)

AI agents perform significantly better when task management is externalized into persistent, structured storage rather than held in the context window. Steve Yegge's **Beads** framework demonstrates this by storing agent tasks in a Dolt-backed database. Agents read, create, and update tasks via SQL without cluttering their primary context.

**Gastown** is the multi-agent orchestrator built on top of Beads, proving that with proper agentic memory, multi-agent systems are practical. Dolt's combination of SQL querying, schema enforcement, and Git-style version control gives agents a persistent memory layer that survives across sessions.

Problems solved:
- **Cold start**: agents regain context and progress across sessions rather than starting fresh
- **Context limits**: structured information (tasks, relationships) offloaded to storage, preserving working memory
- **Multi-session execution**: complex, multi-step projects extend beyond single agent sessions
- **Multi-agent coordination**: shared, version-controlled memory enables parallel task execution

Source: [Agentic Memory](https://www.dolthub.com/blog/2026-01-22-agentic-memory/)

## 3. Multi-Agent Persistence

Multi-agent systems require persistence that bridges structured data (databases) and versioned data (Git). Traditional solutions force a choice between them. Claude Code stores agent state as JSON files; early Beads used SQLite synced to JSONL in Git — an approach that proved too fragile. Dolt eliminates this tension by providing SQL + Git in a single system.

The impact on scale is dramatic. After migrating Beads to Dolt, Gastown scaled from struggling with 4 concurrent agents to approximately 160 on a single host and approximately 600 across Kubernetes. Agents query task graphs with fine-grained SQL precision without polluting their context windows, while Dolt maintains full audit trails for debugging conflicts when agents update shared state.

Advanced patterns in use include rebasing for history compression and unversioned ephemeral tables for transient agent state.

Key concepts:
- SQL + Git convergence in a single database
- Branch isolation for concurrent agent writes
- Horizontal scaling from single-digit to hundreds of agents
- Full audit trail for debugging multi-agent conflicts

Source: [Multi-Agent Persistence](https://www.dolthub.com/blog/2026-03-13-multi-agent-persistence/)

## 4. Version Control for Agent Data

AI agents make mistakes. When an agent operates on data, you need the ability to discard changes or quickly roll back — the same safety net developers have with Git for source code. Dolt extends Git-style version control to databases: branch, diff, merge, revert, and reset all work on table data.

Branching also enables parallelism. With branch-per-agent or clone-per-agent isolation, dozens or hundreds of agents can operate concurrently without interfering with each other. Validated changes merge back to the production branch through review workflows. Dolt's queryable diff functionality lets reviewers inspect exactly what an agent changed before approving.

Key concepts:
- Branch-per-agent for isolated, parallel operations
- Diff for human or automated review of agent modifications
- Rollback on failure without affecting other agents
- Three pillars of agentic data: structured, versioned, and queryable

Source: [Agentic AI Three Pillars — Version Control](https://www.dolthub.com/blog/2025-09-08-agentic-ai-three-pillars/#version-control)

## 5. EU AI Act Compliance

For organizations working in the EU, Dolt's version control capabilities map directly to two critical EU AI Act requirements.

**Data Governance (Article 10)** requires organizations to maintain audit trails over training data. Dolt provides queryable history at any point in time via tagged commits, cell-level diffs showing exactly what changed between versions, and commit metadata (author, timestamp, description) for accountability. Teams can query data "as of" specific model training dates to verify dataset integrity and detect bias.

**Human Oversight (Article 14)** requires human review of AI-generated modifications. Dolt's pull request workflow lets AI systems propose changes on branches that humans must review before merging. Rollback is straightforward via `revert`, `reset`, or `checkout` operations. Reviewers see exactly what changed before approving or rejecting.

Case studies:
- **Flock Safety**: demonstrates data governance compliance through version-controlled training data
- **Nautobot**: demonstrates human oversight in critical network infrastructure management

Source: [EU AI Act](https://www.dolthub.com/blog/2026-02-02-eu-ai-act/)

## References

- [Cursor for Everything](https://www.dolthub.com/blog/2025-11-19-cursor-for-everything/) — Branch-based preview-before-commit for database apps
- [Introducing Agent Mode](https://www.dolthub.com/blog/2026-02-09-introducing-agent-mode/) — AI chat interface in the Dolt Workbench
- [Agentic Memory](https://www.dolthub.com/blog/2026-01-22-agentic-memory/) — Beads and Gastown: externalized agent task management
- [Multi-Agent Persistence](https://www.dolthub.com/blog/2026-03-13-multi-agent-persistence/) — Scaling concurrent agents with Dolt
- [Agentic AI Three Pillars — Version Control](https://www.dolthub.com/blog/2025-09-08-agentic-ai-three-pillars/#version-control) — Why agents need Git-style branching for data
- [EU AI Act](https://www.dolthub.com/blog/2026-02-02-eu-ai-act/) — Dolt for data governance and human oversight compliance
