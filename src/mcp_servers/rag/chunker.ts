// src/mcp_servers/rag/chunker.ts

import * as fs from "fs";
import * as path from "path";

export interface Chunk {
    id: string;
    source_file: string;
    content: string;
    start_line: number;
    end_line: number;
}

const CHUNK_SIZE = 500;       // target characters per chunk
const CHUNK_OVERLAP = 100;    // overlap between consecutive chunks

export function chunkFile(filePath: string, baseDir: string): Chunk[] {
    const content = fs.readFileSync(filePath, "utf-8");
    const relativePath = path.relative(baseDir, filePath);
    const lines = content.split("\n");
    const chunks: Chunk[] = [];

    let currentChunk = "";
    let startLine = 0;
    let charCount = 0;

    for (let i = 0; i < lines.length; i++) {
        currentChunk += (currentChunk ? "\n" : "") + lines[i];
        charCount += lines[i].length + 1;

        if (charCount >= CHUNK_SIZE) {
            chunks.push({
                id: `${relativePath}:${startLine}-${i}`,
                source_file: relativePath,
                content: currentChunk.trim(),
                start_line: startLine,
                end_line: i
            });

            // Overlap: back up by CHUNK_OVERLAP characters worth of lines
            let overlapChars = 0;
            let overlapStart = i;
            while (overlapStart > startLine && overlapChars < CHUNK_OVERLAP) {
                overlapChars += lines[overlapStart].length + 1;
                overlapStart--;
            }
            startLine = overlapStart + 1;
            currentChunk = lines.slice(startLine, i + 1).join("\n");
            charCount = currentChunk.length;
        }
    }

    // Last chunk
    if (currentChunk.trim()) {
        chunks.push({
            id: `${relativePath}:${startLine}-${lines.length - 1}`,
            source_file: relativePath,
            content: currentChunk.trim(),
            start_line: startLine,
            end_line: lines.length - 1
        });
    }

    return chunks;
}

export function chunkDirectory(dirPath: string): Chunk[] {
    const allChunks: Chunk[] = [];

    function walk(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
            } else if (entry.name.endsWith(".txt")) {
                const chunks = chunkFile(fullPath, dirPath);
                allChunks.push(...chunks);
            }
        }
    }

    walk(dirPath);
    return allChunks;
}