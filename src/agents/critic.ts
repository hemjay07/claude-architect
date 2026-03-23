
import Anthropic from "@anthropic-ai/sdk";
import { AnthropicClient } from "../api_client/client";
import { loadPrompt } from "../prompt_library/prompt_loader";
import { validateOutput } from "../prompt_library/schema_validator";
import { ClinicalCritiqueSchema } from "../prompt_library/schemas/clinical_critique_schema";
import { ResearchFindings, CriticEvaluation, CriticEvaluationSchema } from "./types";

export async function runCritic(
    findings: ResearchFindings,
    anthropicClient: AnthropicClient
): Promise<CriticEvaluation> {
    const prompt = loadPrompt("clinical_critique", "1.0.0");

    const input = `TASK: ${findings.clinical_question}

RESEARCHER OUTPUT:
${findings.findings}

TRIALS CONSULTED: ${findings.trials_consulted.join(", ")}
FILES READ: ${findings.files_read.join(", ")}
CONFIDENCE: ${findings.confidence}
SAFETY FLAGS: ${findings.safety_flags.join(", ") || "none"}
DATA GAPS: ${findings.data_gaps.join(", ") || "none"}`;


const response = await anthropicClient.complete(
    [
        ...prompt.examples.map((ex, i) => [
            { role: "user" as const, content: ex.input },
            { role: "assistant" as const, content: ex.output }
        ]).flat(),
        { role: "user", content: input }
    ] as Anthropic.MessageParam[],
    {
        model: "claude-sonnet-4-6",
        maxTokens: 2048,
        system: prompt.system,
    }
);

    const textBlock = response.content.find(b => b.type === "text");
    const rawOutput = textBlock && textBlock.type === "text" ? textBlock.text : "";



    const validation = validateOutput(rawOutput, CriticEvaluationSchema);
        if (validation.valid && validation.data) {
            return { ...validation.data, task_id: findings.task_id };
        }

    // Fallback
    return {
        task_id: findings.task_id,
        decision: "escalate",
        accuracy_score: 0,
        completeness_score: 0,
        safety_score: 0,
        feedback: "Critic could not evaluate the findings.",
        safety_flags: [],
    };
}