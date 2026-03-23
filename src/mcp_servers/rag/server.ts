// src/mcp_servers/rag/server.ts

import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { chunkDirectory, Chunk } from "./chunker";
import { HybridIndex } from "./index";

const LITERATURE_DIR = path.join(process.cwd(), "literature");
const CACHE_PATH = path.join(process.cwd(), "rag_cache.json");

const server = new McpServer({
    name: "rag-server",
    version: "1.0.0"
});

const index = new HybridIndex();
let chunks: Chunk[] = [];

// ── Tools ────────────────────────────────────────────────────────────────────

server.tool(
    "search",
    "Search the clinical literature using hybrid BM25 + semantic search. Returns ranked chunks with source citations.",
    {
        query: z.string().describe("The clinical search query"),
        top_k: z.number().min(1).max(20).default(5).describe("Number of results to return")
    },
    async ({ query, top_k }) => {
        try {
            const results = await index.search(query, top_k);

            const formatted = results.map((r, i) => {
                return `[${i + 1}] Score: ${r.score.toFixed(4)} (BM25: ${r.bm25_score.toFixed(2)}, Vector: ${r.vector_score.toFixed(4)})
Source: ${r.chunk.source_file} (lines ${r.chunk.start_line}-${r.chunk.end_line})
Content:
${r.chunk.content}`;
            }).join("\n\n---\n\n");

            return {
                content: [{ type: "text", text: formatted }]
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: JSON.stringify({
                    code: "SEARCH_FAILED",
                    message: `Search failed: ${error}`,
                    recoverable: true
                }) }],
                isError: true
            };
        }
    }
);

server.tool(
    "get_sources",
    "List all indexed literature documents with chunk counts.",
    {},
    async () => {
        const sourceCounts = new Map<string, number>();
        for (const chunk of chunks) {
            sourceCounts.set(chunk.source_file, (sourceCounts.get(chunk.source_file) || 0) + 1);
        }

        const lines = Array.from(sourceCounts.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([file, count]) => `${file} (${count} chunks)`);

        return {
            content: [{ type: "text", text: lines.join("\n") }]
        };
    }
);

// ── Resources ────────────────────────────────────────────────────────────────

server.resource(
    "stats",
    "rag://stats",
    async (uri) => {
        const stats = index.getStats();
        return {
            contents: [{
                uri: uri.href,
                mimeType: "application/json",
                text: JSON.stringify(stats, null, 2)
            }]
        };
    }
);

// ── Startup ──────────────────────────────────────────────────────────────────

async function main() {
    // Chunk the literature directory
    console.error("[RAG] Chunking literature files...");
    chunks = chunkDirectory(LITERATURE_DIR);
    console.error(`[RAG] ${chunks.length} chunks from ${new Set(chunks.map(c => c.source_file)).size} files`);

    // Build the index (loads cache if available)
    await index.build(chunks);

    // Start MCP server
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[RAG] Server running on stdio");
}

main().catch(err => {
    console.error("[RAG] Fatal:", err);
    process.exit(1);
});