import { z } from "zod";

export interface ValidationResult<T> {
    valid: boolean;
    data?: T;
    error?: string;
}

function extractJson(raw: string): string {
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
        return fenceMatch[1].trim();
    }

    const curly  = raw.indexOf('{');
    const square = raw.indexOf('[');

    let start: number;
    if (curly === -1 && square === -1) {
        return raw;
    } else if (curly === -1) {
        start = square;
    } else if (square === -1) {
        start = curly;
    } else {
        start = Math.min(curly, square);
    }

    const end = Math.max(raw.lastIndexOf('}'), raw.lastIndexOf(']'));
    return raw.slice(start, end + 1).trim();
}

export function validateOutput<T>(
    raw: string,
    schema: z.ZodSchema<T>
): ValidationResult<T> {
    try {
        const cleaned = extractJson(raw);

        if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
            return {
                valid: false,
                error: `Claude did not return JSON. Raw output: "${cleaned.slice(0, 100)}"`
            };
        }

        const parsed  = JSON.parse(cleaned);
        const result  = schema.parse(parsed);
        return { valid: true, data: result };
    } catch (error) {
        return {
            valid: false,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}