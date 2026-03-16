# Claude Architect

A production-grade GLP-1 clinical research agent built as part of the **Claude Certified Architect** curriculum. Every phase is built from scratch — no pre-built agents, no tutorials.

## What This Is

A multi-agent system that synthesizes evidence from GLP-1 cardiovascular outcomes trials (SUSTAIN-6, SELECT, LEADER, FLOW, SURPASS-CVOT and others) to answer clinical research questions. The architecture mirrors what you'd build at a healthcare AI company.

## Architecture

```
Orchestrator Agent
    ├── decomposes clinical questions into sub-tasks
    ├── delegates to Researcher
    └── passes findings to Critic → accept / reject / escalate

Researcher Agent  (MCP tools → SQLite + literature files)
    ├── queries clinical_trials.db for quantitative outcomes
    └── reads structured literature summaries

Critic Agent
    ├── scores on accuracy, completeness, safety flag appropriateness (0-5)
    └── enforces circuit breakers on failure
```

## Build Status

| Phase | Focus | Status |
|-------|-------|--------|
| Phase 1 | API client, caching, batching, streaming | ✅ Complete |
| Phase 2 | Prompt library, schemas, validator, regression tests | ✅ Complete |
| Phase 3 | MCP servers (database + filesystem) | 🔄 In progress |
| Phase 4 | Multi-agent system with circuit breakers | ⏳ Pending |
| Phase 5 | Claude Code configuration | ⏳ Pending |
| Phase 6 | Eval suite + cost architecture | ⏳ Pending |

## Stack

- **Language**: TypeScript
- **Validation**: Zod (runtime schema enforcement on all agent outputs)
- **Database**: SQLite (12 seeded GLP-1 trials with full outcomes data)
- **MCP**: Custom database + filesystem servers
- **Models**: Haiku (routing/extraction) · Sonnet (critique/synthesis) · Sonnet + thinking (evidence synthesis)

## Key Design Decisions

**Why schema validation on every agent output?** Inter-agent messages pass through Zod validation before the next agent sees them. If the Researcher returns strings where the Critic expects objects, the system fails loudly at the boundary — not silently in production.

**Why versioned prompt files?** Every prompt lives in a JSON file with semver versioning. The regression test runs all prompt versions against the real API after every change. Schema drift gets caught before it reaches production.

**Why Sonnet for the Critic, not Haiku?** The Critic evaluates whether clinical evidence was accurately represented and whether safety signals were appropriately flagged. That's clinical judgment, not pattern matching. The quality gate needs to be reliable.

## Running the Regression Test

```bash
npm install
npx tsc
node dist/src/prompt_library/tests/run_prompt_regression.js
```

Expected output:
```
PASS [clinical_router]
PASS [clinical_extraction]
PASS [clinical_critique]
PASS [clinical_synthesis]
4 tests — 4 passed, 0 failed
```

## Project Structure

```
src/
  api_client/
    client.ts          # AnthropicClient wrapper — caching, streaming, batching, retry
    ledger.ts          # SQLite usage ledger — every API call logged with token counts
  prompt_library/
    prompts/           # Versioned JSON prompt files
    schemas/           # Zod schemas for all agent outputs
    tests/             # Regression test suite
    prompt_loader.ts   # Loads and validates prompt files
    schema_validator.ts # Extracts and validates Claude JSON output
```

## Domain

All trials are from published peer-reviewed sources. The database covers: SUSTAIN-6, SELECT, PIONEER-6, LEADER, SURPASS-CVOT, STEP-1, STEP-HFpEF, FLOW, EMPA-KIDNEY, SURMOUNT-1, AWARD-11, ELIXA.

---

*Building in public. Updates as each phase completes.*
