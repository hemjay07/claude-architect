# Claude Architect — GLP-1 Clinical Research Agent

## Purpose
Portfolio project demonstrating senior AI engineering. Target companies: Hippocratic AI, Ambience, Beacon Health. The goal is production-grade, not overengineered — every architectural decision should be defensible in an interview.

## What this is
A multi-agent clinical research system that answers questions about GLP-1 receptor agonist trials by querying a real SQLite database and reading verified literature files through MCP. Three agents — Orchestrator, Researcher, Critic — with circuit breakers and Zod-validated inter-agent messages.

## Architecture decisions already made — do not relitigate
- TypeScript, CommonJS modules
- MCP for all data access (no direct DB/file reads in agent code)
- Zod for all runtime validation — schemas are the contract between agents
- Tool names use __ separator when passed to Anthropic API (API rejects ::)
- Researcher uses two-phase pattern: tool-calling loop then explicit synthesis call
- Sonnet for judgment tasks (Researcher, Critic), Haiku for classification only

## Key commands
- Compile: `npx tsc`
- Run agents: `node dist/src/agents/test_agents.js`
- Run regression tests: `node dist/src/prompt_library/tests/run_prompt_regression.js`
- Seed database: `node dist/src/mcp_servers/database/seed.js`

## What's next
- Phase 5: Claude Code config (in progress)
- Phase 6: Eval suite
- RAG MCP server: hybrid search (BM25 + cosine) over 13 literature files
