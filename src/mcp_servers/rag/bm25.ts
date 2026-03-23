// src/mcp_servers/rag/bm25.ts

import { Chunk } from "./chunker";

// BM25 parameters — standard values, don't change unless you have a reason
const K1 = 1.5;   // term frequency saturation — higher means raw count matters more
const B = 0.75;    // length normalization — 0 ignores length, 1 fully normalizes

export class BM25Index {
    private chunks: Chunk[] = [];
    private tokenizedDocs: string[][] = [];
    private avgDocLength: number = 0;
    private docFrequency: Map<string, number> = new Map(); // how many docs contain each term
    private totalDocs: number = 0;

    build(chunks: Chunk[]): void {
        this.chunks = chunks;
        this.totalDocs = chunks.length;

        // Tokenize every chunk
        this.tokenizedDocs = chunks.map(c => this.tokenize(c.content));

        // Average document length
        const totalTokens = this.tokenizedDocs.reduce((sum, doc) => sum + doc.length, 0);
        this.avgDocLength = totalTokens / this.totalDocs;

        // Document frequency: how many chunks contain each term
        this.docFrequency.clear();
        for (const doc of this.tokenizedDocs) {
            const uniqueTerms = new Set(doc);
            for (const term of uniqueTerms) {
                this.docFrequency.set(term, (this.docFrequency.get(term) || 0) + 1);
            }
        }
    }

    search(query: string, topK: number = 5): { chunk: Chunk; score: number }[] {
        const queryTerms = this.tokenize(query);
        const scores: { chunk: Chunk; score: number }[] = [];

        for (let i = 0; i < this.chunks.length; i++) {
            const doc = this.tokenizedDocs[i];
            let score = 0;

            for (const term of queryTerms) {
                const df = this.docFrequency.get(term) || 0;
                if (df === 0) continue;

                // IDF: rare terms score higher
                const idf = Math.log((this.totalDocs - df + 0.5) / (df + 0.5) + 1);

                // Term frequency in this document
                const tf = doc.filter(t => t === term).length;

                // BM25 formula
                const numerator = tf * (K1 + 1);
                const denominator = tf + K1 * (1 - B + B * (doc.length / this.avgDocLength));
                score += idf * (numerator / denominator);
            }

            if (score > 0) {
                scores.push({ chunk: this.chunks[i], score });
            }
        }

        return scores.sort((a, b) => b.score - a.score).slice(0, topK);
    }

    private tokenize(text: string): string[] {
        return text
            .toLowerCase()
            .replace(/[^a-z0-9\s.-]/g, " ")
            .split(/\s+/)
            .filter(t => t.length > 1);
    }
}