# Agents Sub-Module

## The three agents
- **Orchestrator**: entry point. Receives clinical question, runs Researcher-Critic loop (max 3 iterations), compiles final report.
- **Researcher**: uses MCP tools to gather evidence. Two phases — tool-calling loop (max 20 calls) then explicit synthesis call with no tools.
- **Critic**: single API call. Scores findings on accuracy, completeness, safety (0-5). Returns accept / reject_with_feedback / escalate.

## Circuit breakers
- Researcher: MAX_TOOL_CALLS = 20 → break loop, proceed to synthesis
- Orchestrator: MAX_ITERATIONS = 3 → return partial result
- Safety score ≤ 2 → escalate immediately
- stop_reason max_tokens → break loop immediately

## Inter-agent message flow
ResearchTask (Orchestrator → Researcher) → ResearchFindings (Researcher → Critic) → CriticEvaluation (Critic → Orchestrator) → FinalReport (Orchestrator → user)

All messages validated with Zod schemas in types.ts before use.

## Why the two-phase Researcher pattern
Model in tool-calling mode never cleanly transitions to synthesis. Separating the phases — gather with tools, then synthesize in a fresh call with tool_choice: none — is the reliable production pattern.
