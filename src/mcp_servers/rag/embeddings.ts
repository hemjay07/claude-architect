// src/mcp_servers/rag/embeddings.ts

import "dotenv/config";
import OpenAI from "openai";
import { Chunk } from "./chunker";

const client = new OpenAI();
const MODEL = "text-embedding-3-small";

export async function embedText(text: string): Promise<number[]> {
    const response = await client.embeddings.create({
        model: MODEL,
        input: text
    });
    return response.data[0].embedding;
}

export async function embedChunks(chunks: Chunk[]): Promise<Map<string, number[]>> {
    const embeddings = new Map<string, number[]>();

    // Batch in groups of 20 to avoid rate limits
    const batchSize = 20;
    for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const response = await client.embeddings.create({
            model: MODEL,
            input: batch.map(c => c.content)
        });

        for (let j = 0; j < batch.length; j++) {
            embeddings.set(batch[j].id, response.data[j].embedding);
        }
    }

    return embeddings;
}

export function cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;
    return dotProduct / denominator;
}