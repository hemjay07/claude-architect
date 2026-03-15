import fs from "fs";
import path from "path";
import { z } from "zod";

const PromptFileSchema = z.object({
    name: z.string(),
    version: z.string(),
    model_target: z.string(),
    system: z.string(),
    examples: z.array(z.object({
        input: z.string(),
        output: z.string()
    })).default([]),
    output_schema: z.string(),
    notes: z.string().optional(),
    thinking:        z.boolean().default(false),       
    thinking_budget: z.number().default(1024), 
});

export type PromptFile = z.infer<typeof PromptFileSchema>;

const PROMPTS_DIR = path.join(process.cwd(), "src/prompt_library/prompts");

export function loadPrompt(name: string, version: string): PromptFile {
    const filename = `${name}.v${version}.json`;
    const fullPath = path.join(PROMPTS_DIR, filename);

    if (!fs.existsSync(fullPath)) {
        throw new Error(`Prompt not found: ${fullPath}`);
    }

    const raw = fs.readFileSync(fullPath, "utf-8");
    const parsed = JSON.parse(raw);
    return PromptFileSchema.parse(parsed);
}