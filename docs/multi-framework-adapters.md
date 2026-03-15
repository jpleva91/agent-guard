# Multi-Framework Adapter System — AgentGuard

This document describes the architecture for extending AgentGuard beyond Claude Code to support multiple AI agent frameworks.

## Context

AgentGuard currently supports a single framework adapter: Claude Code (`src/adapters/claude-code.ts`). The adapter registry (`src/adapters/registry.ts`) maps action classes to execution handlers, but the ingestion side — translating framework-specific payloads into `RawAgentAction` — is tightly coupled to Claude Code's PreToolUse/PostToolUse hook pattern.

The governance kernel is already framework-agnostic. It accepts `RawAgentAction` objects and returns `GovernanceDecisionRecord` results. The gap is in the translation layer: each framework has a different mechanism for tool invocation, and each needs a bridge to the kernel.

## FrameworkAdapter Interface

```
FrameworkAdapter {
  name: string
  translateToRawAction(frameworkPayload: unknown): RawAgentAction
  translateResult(kernelResult: GovernanceDecisionRecord): unknown
  install(): Promise<void>    // Set up hooks/middleware in the target framework
  uninstall(): Promise<void>  // Remove hooks/middleware
}
```

**Key design decisions:**
- `translateToRawAction` accepts `unknown` because each framework has its own payload shape
- `translateResult` converts kernel decisions back to framework-specific responses (e.g., Claude Code expects `{ decision: 'allow' | 'block' }`)
- `install()` / `uninstall()` handle framework-specific setup (hook registration, middleware injection, config file updates)

## Target Directory Structure

```
src/adapters/
├── registry.ts              # Existing action class → handler registry
├── framework.ts             # FrameworkAdapter interface definition
├── framework-registry.ts    # Framework adapter registry
├── claude-code.ts           # Existing Claude Code adapter
└── frameworks/
    ├── mcp.ts               # MCP (Model Context Protocol)
    ├── langchain.ts         # LangChain / LangGraph
    ├── openai-agents.ts     # OpenAI Agents SDK
    ├── autogen.ts           # AutoGen
    └── copilot-cli.ts       # Copilot CLI
```

## Adapter Priority & Complexity

| Framework | Priority | Complexity | Integration Mechanism |
|-----------|----------|------------|----------------------|
| MCP (Model Context Protocol) | P0 | Medium | Intercept `call_tool` requests; MCP tools map naturally to `RawAgentAction` |
| LangChain / LangGraph | P0 | Medium | Wrap `BaseTool.invoke()` with governance middleware |
| OpenAI Agents SDK | P1 | Medium | Function calling interception via middleware |
| AutoGen | P1 | Medium | Agent message interception |
| Copilot CLI | P2 | Low | Hook-based pattern similar to Claude Code |

## Adapter Details

### MCP Adapter

MCP's `call_tool` request contains a tool name and arguments object. This maps directly to `RawAgentAction`:

```
MCP call_tool request:
  { method: "call_tool", params: { name: "write_file", arguments: { path: "...", content: "..." } } }

Translated to:
  RawAgentAction { tool: "write_file", input: { path: "...", content: "..." } }
```

**Integration approach:**
- MCP server middleware that intercepts `call_tool` before forwarding to the tool handler
- The middleware calls the governance kernel, blocks or allows based on decision
- Response is passed back through MCP's standard response format

### LangChain / LangGraph Adapter

LangChain tools extend `BaseTool` with an `invoke()` method. The adapter wraps this:

```
Original: tool.invoke(input) → result
Governed: governedTool.invoke(input) → kernel.evaluate(action) → if allowed: tool.invoke(input) → result
```

**Integration approach:**
- Provide a `GovernedTool` wrapper class that extends `BaseTool`
- `install()` patches the tool registry to wrap all tools
- Works with both LangChain and LangGraph (shared tool interface)

### OpenAI Agents SDK Adapter

OpenAI's function calling sends tool calls as part of the completion response. The adapter intercepts before execution:

```
Agent response includes: { tool_calls: [{ function: { name: "...", arguments: "..." } }] }
Adapter intercepts each tool_call before the runner executes it
```

**Integration approach:**
- Middleware in the agent runner's tool execution loop
- Each function call is translated to `RawAgentAction` and evaluated
- Denied calls return an error message to the agent

### AutoGen Adapter

AutoGen agents communicate via messages, with tool calls embedded in agent responses.

**Integration approach:**
- Message interceptor between agents
- Tool call messages are extracted, evaluated, and blocked or forwarded
- Works with AutoGen's multi-agent conversation pattern

### Copilot CLI Adapter

Similar to Claude Code — hook-based pattern where the CLI emits events before tool execution.

**Integration approach:**
- Register pre/post execution hooks
- Same translation pattern as Claude Code adapter
- Lower priority as the hook surface is similar

## Framework Adapter Registry

The framework adapter registry manages adapter lifecycle:

```
FrameworkAdapterRegistry {
  register(adapter: FrameworkAdapter): void
  get(name: string): FrameworkAdapter | undefined
  list(): FrameworkAdapter[]
  installAll(): Promise<void>
  uninstallAll(): Promise<void>
}
```

## CLI Integration

Extend the existing `init` command to scaffold framework-specific integration:

```bash
agentguard init mcp          # Set up MCP middleware
agentguard init langchain    # Set up LangChain tool wrapper
agentguard init openai       # Set up OpenAI Agents SDK middleware
agentguard init autogen      # Set up AutoGen message interceptor
agentguard init copilot      # Set up Copilot CLI hooks
agentguard init claude-code  # Existing Claude Code setup
```

Each `init` command:
1. Detects the framework in the current project (package.json, imports, config files)
2. Installs necessary configuration or middleware files
3. Outputs quick-start instructions

## Key Files to Modify

| File | Change |
|------|--------|
| `src/adapters/registry.ts` | Extend to support framework adapter registration alongside action handlers |
| `src/cli/commands/init.ts` | Add framework scaffolding subcommands |
| `src/core/types.ts` | Add `FrameworkAdapter` interface |

## Verification

- Each adapter has integration tests against its framework's test harness
- `agentguard init <framework>` works for all supported frameworks
- All existing tests continue to pass (`npm run ts:test`)
- Framework-specific payloads correctly translate to `RawAgentAction` with proper action classification

## References

- [Unified Architecture](unified-architecture.md)
