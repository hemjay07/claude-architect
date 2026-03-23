import Anthropic from "@anthropic-ai/sdk";
import { MCPClient } from "../mcp_client/client";
import { runResearcher } from "./researcher";
import { runCritic } from "./critic";
import {
    ResearchTask,
    ResearchFindings,
    CriticEvaluation,
    FinalReport,
    FinalReportSchema
} from "./types";

const MAX_ITERATIONS = 3;

export async function runOrchestrator(
    clinicalQuestion: string,
    mcpClient: MCPClient,
    anthropicClient: Anthropic
): Promise<FinalReport> {

    console.log(`\nOrchestrator starting: "${clinicalQuestion}"`);

    const taskId = `task_${Date.now()}`;
    let iterations = 0;
    let lastFindings: ResearchFindings | null = null;
    let lastEvaluation: CriticEvaluation | null = null;

    // ── Researcher-Critic loop ────────────────────────────────────────────────
    while (iterations < MAX_ITERATIONS) {
        iterations++;
        console.log(`\n[Iteration ${iterations}/${MAX_ITERATIONS}]`);

        // Build feedback context for Researcher
        const context = lastEvaluation?.decision === "reject_with_feedback"
            ? `Previous attempt was rejected. Feedback: ${lastEvaluation.feedback}`
            : undefined;

        const task: ResearchTask = {
            task_id: taskId,
            clinical_question: clinicalQuestion,
            subtask: clinicalQuestion,
            context,
        };

        // Run Researcher
        console.log("  → Running Researcher...");
        lastFindings = await runResearcher(task, mcpClient, anthropicClient);
        console.log(`  ✓ Researcher complete. Confidence: ${lastFindings.confidence}`);
        console.log(`    Trials: ${lastFindings.trials_consulted.join(", ") || "none"}`);

        // Run Critic
        console.log("  → Running Critic...");
        lastEvaluation = await runCritic(lastFindings, anthropicClient);
        console.log(`  ✓ Critic decision: ${lastEvaluation.decision}`);
        console.log(`    Scores — Accuracy: ${lastEvaluation.accuracy_score}/5, Completeness: ${lastEvaluation.completeness_score}/5, Safety: ${lastEvaluation.safety_score}/5`);

        // Circuit breaker — escalate if safety score is too low
        if (lastEvaluation.safety_score <= 2) {
            console.log("  ⚠ Safety score too low — escalating");
            return buildReport(clinicalQuestion, lastFindings, lastEvaluation, iterations, "escalated");
        }

        // Accept or continue
        if (lastEvaluation.decision === "accept") {
            console.log("  ✓ Accepted — compiling final report");
            break;
        }

        if (lastEvaluation.decision === "escalate") {
            console.log("  ⚠ Critic escalated — stopping loop");
            return buildReport(clinicalQuestion, lastFindings, lastEvaluation, iterations, "escalated");
        }

        // reject_with_feedback — loop continues with feedback
        console.log(`  ↺ Rejected — retrying with feedback: ${lastEvaluation.feedback}`);
    }

    // Max iterations reached
    if (iterations >= MAX_ITERATIONS && lastEvaluation?.decision !== "accept") {
        console.log(`  ⚠ Max iterations (${MAX_ITERATIONS}) reached — returning partial result`);
        return buildReport(clinicalQuestion, lastFindings!, lastEvaluation!, iterations, "partial");
    }

    return buildReport(clinicalQuestion, lastFindings!, lastEvaluation!, iterations, "complete");
}

function buildReport(
    clinicalQuestion: string,
    findings: ResearchFindings,
    evaluation: CriticEvaluation,
    iterations: number,
    status: "complete" | "partial" | "escalated"
): FinalReport {
    return {
        clinical_question: clinicalQuestion,
        summary: findings.findings,
        key_findings: findings.trials_consulted.map(t => `Evidence from ${t}`),
        safety_considerations: [
            ...findings.safety_flags,
            ...evaluation.safety_flags
        ],
        evidence_strength: findings.confidence === "high" ? "strong"
            : findings.confidence === "medium" ? "moderate"
            : "weak",
        limitations: findings.data_gaps,
        iterations_required: iterations,
        status,
    };
}