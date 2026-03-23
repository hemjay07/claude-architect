// src/mcp_servers/rag/index.ts

import { Chunk } from "./chunker";
import { BM25Index } from "./bm25";
import { embedText, embedChunks, cosineSimilarity } from "./embeddings";

export interface SearchResult {
    chunk: Chunk;
    score: number;
    bm25_score: number;
    vector_score: number;
}

export class HybridIndex {
    private chunks: Chunk[] = [];
    private bm25: BM25Index = new BM25Index();
    private embeddings: Map<string, number[]> = new Map();

    async build(chunks: Chunk[]): Promise<void> {
        this.chunks = chunks;

        // Build BM25 index (instant — no API calls)
        console.error("[RAG] Building BM25 index...");
        this.bm25.build(chunks);

        // Build vector index (requires OpenAI API calls)
        console.error(`[RAG] Embedding ${chunks.length} chunks...`);
        this.embeddings = await embedChunks(chunks);
        console.error("[RAG] Index ready.");
    }

    async search(query: string, topK: number = 5): Promise<SearchResult[]> {
        // BM25 keyword search
        const bm25Results = this.bm25.search(query, topK * 2);

        // Vector semantic search
        const queryEmbedding = await embedText(query);
        const vectorScores: { chunk: Chunk; score: number }[] = [];

        for (const chunk of this.chunks) {
            const embedding = this.embeddings.get(chunk.id);
            if (!embedding) continue;
            const score = cosineSimilarity(queryEmbedding, embedding);
            vectorScores.push({ chunk, score });
        }

        vectorScores.sort((a, b) => b.score - a.score);
        const topVector = vectorScores.slice(0, topK * 2);

        // Combine scores with reciprocal rank fusion
        const fusedScores = new Map<string, SearchResult>();

        for (let i = 0; i < bm25Results.length; i++) {
            const id = bm25Results[i].chunk.id;
            const rrf = 1 / (60 + i + 1); // reciprocal rank fusion constant = 60
            fusedScores.set(id, {
                chunk: bm25Results[i].chunk,
                score: rrf,
                bm25_score: bm25Results[i].score,
                vector_score: 0
            });
        }

        for (let i = 0; i < topVector.length; i++) {
            const id = topVector[i].chunk.id;
            const rrf = 1 / (60 + i + 1);
            const existing = fusedScores.get(id);
            if (existing) {
                existing.score += rrf;
                existing.vector_score = topVector[i].score;
            } else {
                fusedScores.set(id, {
                    chunk: topVector[i].chunk,
                    score: rrf,
                    bm25_score: 0,
                    vector_score: topVector[i].score
                });
            }
        }

        return Array.from(fusedScores.values())
            .sort((a, b) => b.score - a.score)
            .slice(0, topK);
    }

    getStats(): { totalChunks: number; totalDocuments: number } {
        const uniqueDocs = new Set(this.chunks.map(c => c.source_file));
        return {
            totalChunks: this.chunks.length,
            totalDocuments: uniqueDocs.size
        };
    }
}