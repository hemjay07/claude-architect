# Claude Architect

A production-grade GLP-1 clinical research agent built as part of the **Claude Certified Architect** curriculum. Every phase is built from scratch — no frameworks, no pre-built agents, no tutorials. Built in public on X ([@__mujeeb__](https://x.com/__mujeeb__)).

## What This Is

A multi-agent system that answers clinical research questions about GLP-1 receptor agonists by querying a real SQLite database and reading verified literature files through MCP. Three agents with circuit breakers, Zod-validated inter-agent messages, and an eval suite that catches regressions before they reach production.

## Architecture

```
User question
    ↓
Orchestrator Agent
    ├── Researcher Agent
    │     ├── db:: MCP server → SQLite (12 GLP-1 trials, quantitative outcomes)
    │     └── fs:: MCP server → Literature files (13 files across glp1/, mechanisms/, safety/)
    │     [Two-phase pattern: tool-calling loop → explicit synthesis call]
    └── Critic Agent
          ├── Scores accuracy, completeness, safety (0-5)
          └── Returns accept | reject_with_feedback | escalate
```

**Circuit breakers:** Researcher max 20 tool calls → synthesis. Orchestrator max 3 Researcher-Critic iterations → partial result. Safety score ≤ 2 → immediate escalation.

## Build Status

| Phase | Focus | Status |
|-------|-------|--------|
| Phase 1 | API client, caching, batching, streaming, usage ledger | ✅ Complete |
| Phase 2 | Prompt library, Zod schemas, validator, regression tests | ✅ Complete |
| Phase 3 | MCP servers (database + filesystem), multi-server client | ✅ Complete |
| Phase 4 | Multi-agent system with circuit breakers | ✅ Complete |
| Phase 5 | Claude Code configuration — CLAUDE.md, hooks, slash commands | ✅ Complete |
| Phase 6 | Eval suite + cost architecture | 🔄 In progress |
| RAG | Hybrid search MCP server (BM25 + cosine) over literature | ⏳ Pending |

## Stack

- **Language**: TypeScript, CommonJS
- **Validation**: Zod — runtime schema enforcement on all agent outputs and inter-agent messages
- **Database**: SQLite — 12 seeded GLP-1 trials with full outcomes data
- **MCP**: Two custom servers (database + filesystem) with namespaced tool registry
- **Models**: Haiku (routing/extraction) · Sonnet (researcher/critic/synthesis)
- **Tools**: Claude Code — built with AI assistance, every decision understood and defensible

## Key Design Decisions

**Why schema validation on every inter-agent message?**
Every message that crosses an agent boundary is validated with Zod before the next agent sees it. If the Researcher returns strings where the Critic expects arrays, the system fails loudly at the boundary — not silently three steps later. This is the primary circuit breaker against cascading failures.

**Why versioned prompt files?**
Every prompt lives in a JSON file with semver versioning. The regression test runs all versions against the live API after every change. Schema drift gets caught before it reaches production.

**Why a two-phase Researcher pattern?**
A model in tool-calling mode never cleanly transitions to synthesis — it keeps calling tools. The solution: run the tool loop until `end_turn`, collect all tool results, then make a clean synthesis call with `tool_choice: none`. Gathering and synthesis are architecturally separate.

**Why Sonnet for Researcher and Critic, not Haiku?**
Haiku lacks the judgment to know when it has gathered enough data — it over-calls tools until hitting the limit. The Critic needs clinical judgment to evaluate whether safety signals were appropriately flagged. Both require Sonnet.

**Why MCP instead of direct database/file access in agent code?**
MCP enforces a clean separation between data access and agent logic. The database server has SQL injection defense and a `--allow-writes` permissions gate. The filesystem server sandboxes all paths. These security boundaries can't be bypassed by the agent — they're enforced at the transport layer.

## Running the System

```bash
npm install
npx tsc

# Run regression tests (prompt library)
node dist/src/prompt_library/tests/run_prompt_regression.js

# Run the full research agent
node dist/src/agents/test_agents.js
```

Sample output:
```
Orchestrator starting: "What does the evidence show about semaglutide CV outcomes?"
[Iteration 1/3]
  → Running Researcher...
  ✓ Researcher complete. Confidence: high
    Trials: SUSTAIN-6, PIONEER-6, SELECT, FLOW
  → Running Critic...
  ✓ Critic decision: accept
    Scores — Accuracy: 5/5, Completeness: 5/5, Safety: 5/5
  ✓ Accepted — compiling final report
Status: complete | Evidence strength: strong
```

## Project Structure

```
src/
  api_client/         # AnthropicClient wrapper — caching, streaming, batching, retry
  prompt_library/     # Versioned JSON prompts, Zod schemas, regression tests
  mcp_servers/
    database/         # SQLite MCP server — 4 tools, 2 resources, 1 prompt, SQL injection defense
    filesystem/       # Literature MCP server — 4 tools, path sandbox security
  mcp_client/         # Multi-server client — namespaced tool registry, audit logging
  agents/             # Orchestrator, Researcher, Critic — circuit breakers, Zod validation
evals/
  dataset.jsonl       # 30 test cases — 10 straightforward, 10 moderate, 10 adversarial
  judge.ts            # LLM-as-a-Judge with structured rubric
  run_evals.ts        # Regression detection — flags score drops > 0.5 vs baseline
literature/
  glp1/               # 6 trial summaries (SUSTAIN-6, SELECT, LEADER, STEP-1, FLOW, SURPASS-CVOT, STEP-HFpEF)
  mechanisms/         # 3 mechanism files (receptor, cardiovascular, weight loss)
  safety/             # 3 safety files (GI events, pancreatitis, thyroid)
.claude/
  CLAUDE.md           # Project context — architecture decisions, key commands
  commands/           # Custom slash commands: /review, /cost-check, /agent-run
  settings.json       # Hooks — file protection (PreToolUse), bash audit (PostToolUse)
```

## Domain

All literature files sourced from published peer-reviewed data. Ground truth validated against primary publications. Database covers: SUSTAIN-6, SELECT, PIONEER-6, LEADER, SURPASS-CVOT, STEP-1, STEP-HFpEF, FLOW, EMPA-KIDNEY, SURMOUNT-1, AWARD-11, ELIXA.

---

*Built with Claude Code and the Anthropic API. Building in public — updates after each phase.*