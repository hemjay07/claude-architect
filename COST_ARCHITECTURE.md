# Cost Architecture — GLP-1 Clinical Research Agent

This document details the economic reasoning behind every model selection, caching decision, and cost optimization in the research agent system. All figures are based on real token usage from the Anthropic dashboard (March 2026) and the eval suite (30 test cases, ~95 minutes runtime).

## Observed Usage — Real Numbers

From the Anthropic Console, month-to-date (March 2026):

| Metric | Value |
|---|---|
| **Total spend** | $15.31 |
| **Model** | Claude Sonnet 4.6 (exclusively) |
| **Input tokens** | 2,847,626 |
| **Output tokens** | 450,814 |
| **Cache usage** | None (no caching implemented) |
| **Estimated queries** | ~35 (30 eval cases + debug runs + agent testing) |
| **Cost per query** | ~$0.44 |
| **Input tokens per query** | ~81,000 |
| **Output tokens per query** | ~12,900 |

The input-to-output ratio (~6:1) reflects the agentic pattern: each iteration accumulates the full message history (input grows), while the model's responses stay relatively compact (output is bounded by the synthesis prompt).

## 1. Model Selection Rationale

### Current Model Assignments

| Agent / Task | Model | Input/Output Price | Why This Model |
|---|---|---|---|
| **Router** (clinical_router prompt) | Haiku 4.5 | $1 / $5 per MTok | Classification into 6 categories with confidence score. Structured task, no reasoning needed. Haiku handles this reliably at 3-5x lower cost. |
| **Extraction** (clinical_extraction prompt) | Haiku 4.5 | $1 / $5 per MTok | Named entity extraction into a fixed Zod schema. Pattern matching, not judgment. |
| **Researcher** (tool-calling + synthesis) | Sonnet 4.6 | $3 / $15 per MTok | Must judge when enough data has been gathered and stop calling tools. Haiku lacks this judgment — tested during Phase 4, caused infinite tool loops. |
| **Critic** (structured evaluation) | Sonnet 4.6 | $3 / $15 per MTok | Must evaluate clinical accuracy, completeness, and safety. Requires domain judgment that Haiku cannot reliably provide — tested, produced unreliable scores. |
| **Orchestrator** (task decomposition) | Sonnet 4.6 | $3 / $15 per MTok | Coordinates the Researcher-Critic loop, handles escalation. Requires judgment for task decomposition. |
| **Eval Judge** (offline scoring) | Sonnet 4.6 | $3 / $15 per MTok | Scores agent output against rubric. Runs offline. Sonnet over Opus for cost — eval runs 30-90 cases. |

### The Haiku Trap

During Phase 4, we tested Haiku for the Researcher. Result: infinite tool-calling loops. Haiku lacks the judgment to recognise when it has gathered sufficient evidence — it keeps calling tools until the MAX_TOOL_CALLS circuit breaker fires at 20. The synthesis output was also lower quality because Haiku doesn't reason well about conflicting evidence.

The cost saving of Haiku ($1 vs $3 input) is irrelevant if the agent loops 3x more and produces output the Critic rejects, triggering additional iterations. Sonnet's per-call cost is higher but total cost per completed query is lower because it converges faster.

### Why the Dashboard Shows Only Sonnet

The router and extraction prompts (Haiku) were only used in Phase 2 regression tests — small, isolated calls. The agent system (Phases 4-6) uses Sonnet exclusively. The Haiku calls are too small to register at the scale of ~35 full research queries.

### When Opus Would Be Justified

Opus ($5/$25 per MTok) is not used. It would be justified for complex multi-source clinical reconciliation where Sonnet's reasoning is insufficient, or single high-stakes queries where cost is secondary. Neither applies to this workload.

## 2. Caching Strategy

### Current State: Zero Caching

The dashboard confirms zero cache reads and zero cache writes. Every API call pays full input price. This is the single largest cost optimization opportunity.

### Breakpoint Plan

| Breakpoint | Position | What It Covers | Token Size | Why Here |
|---|---|---|---|---|
| **BP1** | After tool definitions | System prompt + all MCP tool definitions | ~3,500 tokens | Never changes. Shared by every Researcher and Critic call. |
| **BP2** | After last completed subtask | Finished Researcher outputs in Orchestrator history | ~5,000-15,000 tokens (grows) | Stable once written. Prevents re-processing completed work. |
| **BP3** | After last assistant turn | Most recent completed exchange | Variable | Stable until next user message. |
| **BP4** | Reserved | Large tool results | Variable | For single tool returns >2k tokens. |

### BP1 Savings — Real Calculation

System prompt + tools = ~3,500 tokens, shared across ~10 API calls per query.

**Without caching (current):**
10 calls × 3,500 tokens × $3/MTok = $0.105 per query

**With 5-min TTL caching:**
1 write: 3,500 × $3.75/MTok = $0.013
9 reads: 3,500 × $0.30/MTok × 9 = $0.0095
Total: $0.023 per query

**Savings: $0.082 per query (78% reduction on system prompt tokens)**

At observed usage (~35 queries this month): $2.87 saved. At 10,000 queries/month: $820/month.

### BP2 Savings — Context Compounding

In a 3-iteration Researcher-Critic loop (which our eval shows happens on ~30% of queries), the Orchestrator's context grows from ~2,000 to ~7,000 tokens across iterations. Without caching, iteration 3 re-processes all 7,000 tokens. With BP2 after each completed iteration, only new content pays full price.

**Estimated saving per 3-iteration query: ~$0.04**

### When Caching Does NOT Help

1. **Single-query sessions** — cache write cost (1.25x) exceeds standard cost if you never read from it
2. **Dynamic system prompts** — interpolating user data before BP1 breaks the fingerprint. Every call misses.
3. **Low traffic** — 5-min TTL expires between queries. Cache writes wasted.
4. **Concurrent cold starts** — parallel requests before first response completes all miss and pay write cost

## 3. Batch Opportunities

The Batch API provides 50% cost reduction in exchange for asynchronous processing.

### Identified Opportunities

| Workload | Batch Candidate? | Reasoning |
|---|---|---|
| **Eval suite (30 cases)** | **Yes — primary candidate** | No one is waiting. Results needed in hours, not seconds. |
| **Regression tests (4 prompts)** | **Yes** | Automated CI — latency irrelevant. |
| **Bulk literature ingestion (future RAG)** | **Yes** | Embedding generation is offline work. |
| **Interactive research queries** | **No** | User is waiting for the answer. |
| **Critic in agent loop** | **No** | Orchestrator is waiting for the decision. |

### Eval Suite Batch Calculation — Real Numbers

Current eval run (30 cases, standard API):
- Observed: ~2.85M input tokens + ~451k output tokens across ~35 queries
- Estimated eval-only cost: ~$13 per full 30-case run

With Batch API (50% discount): ~$6.50 per run

**Saving: ~$6.50 per full eval run.** At 10 runs during development: $65 saved.

## 4. Scaling Projection

### Per-Query Token Usage (Observed)

From real dashboard data, dividing total usage by estimated query count:

| Metric | Observed | Notes |
|---|---|---|
| **Input tokens per query** | ~81,000 | High due to context compounding in multi-iteration loops |
| **Output tokens per query** | ~12,900 | Bounded by synthesis + critic response lengths |
| **Cost per query** | ~$0.44 | At Sonnet pricing, no caching |
| **Average iterations** | ~1.8 | Based on eval suite — 30% of cases loop 2-3 times |

### Monthly Cost at Scale

| Users | Queries/Month | Monthly Cost (no caching) | With BP1 Caching (~20% input reduction) | With BP1 + Batch Evals |
|---|---|---|---|---|
| **100** | 1,000 | **$437** | **$388** | $388 + eval savings |
| **1,000** | 10,000 | **$4,373** | **$3,882** | $3,882 + eval savings |
| **10,000** | 100,000 | **$43,729** | **$38,819** | $38,819 + eval savings |

### The Cost Cliff

At 1,000 users ($4,373/month), the system is viable for a funded startup.

At 10,000 users ($43,729/month), every optimization matters. The $4,910/month saving from BP1 caching alone pays for infrastructure. Output tokens account for ~43% of total cost despite being only ~14% of token volume — this is because output pricing is 5x input pricing ($15 vs $3 per MTok).

### Token Compounding — The Hidden Cost Multiplier

In a multi-turn agent loop, input tokens compound:

- Critic call 1: 3,000 input tokens
- Researcher revises, Critic call 2: ~5,500 input tokens (original + feedback + revision)
- Critic call 3: ~8,000 input tokens (compounds again)

Call 3 costs ~2.7x what call 1 costs. **This is why circuit breakers are cost containment, not just quality control.** MAX_ITERATIONS = 3 caps the worst-case cost multiplier. Without it, a pathological query could loop indefinitely with unbounded context growth.

## 5. Cost Optimisation Roadmap

Three actions each targeting >30% reduction in a specific cost component.

### Action 1: Implement BP1 Caching on System Prompt + Tools
- **Target:** 78% reduction on system prompt tokens
- **At 10k users:** ~$4,900/month saved
- **Complexity:** Low — add `cache_control: { type: "ephemeral" }` after system prompt + tool definitions
- **Risk:** None — transparent to agent logic

### Action 2: Migrate Eval Suite to Batch API
- **Target:** 50% reduction on all eval and regression test costs
- **At 10 runs/month:** ~$65/month saved (development phase)
- **Complexity:** Medium — restructure run_evals.ts for batch submission and polling
- **Risk:** Latency increases from ~95 minutes to hours. Acceptable for offline eval runs.

### Action 3: Reduce Output Verbosity
- **Target:** 30-40% reduction in output tokens
- **At 10k users:** ~$5,600-7,500/month saved (output tokens are $15/MTok — highest leverage)
- **Complexity:** Medium — add length constraints to synthesis, feedback, and report prompts
- **Risk:** Quality degradation if too aggressive. Must validate via eval suite regression detection.

### Priority Order

1. **BP1 Caching** — low effort, immediate savings, zero risk
2. **Output Verbosity** — highest absolute savings at scale, requires eval validation
3. **Batch Eval** — enables cheaper development iteration

### Known Gap: Usage Ledger Integration

The Phase 1 `AnthropicClient` wrapper logs token usage to a SQLite ledger. The agent system (Phases 4-6) bypasses this wrapper and calls the Anthropic SDK directly — an integration oversight. The dashboard provides accurate total usage but per-query and per-agent breakdowns require wiring the agents through the wrapper. This is a targeted refactor, not a rewrite.

---

*All figures from Anthropic Console dashboard, March 2026. Sonnet 4.6: $3/$15 per MTok. Haiku 4.5: $1/$5 per MTok. Per-query estimates derived from 2,847,626 input tokens and 450,814 output tokens across ~35 research queries. No caching was used — all optimization projections are against the uncached baseline.*
