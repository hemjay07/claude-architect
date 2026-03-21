import { z } from "zod";

// ── Research task — Orchestrator → Researcher ─────────────────────────────────
export const ResearchTaskSchema = z.object({
    task_id: z.string(),
    clinical_question: z.string(),
    subtask: z.string(),
    context: z.string().optional(),
});
export type ResearchTask = z.infer<typeof ResearchTaskSchema>;

// ── Research findings — Researcher → Critic ───────────────────────────────────
export const ResearchFindingsSchema = z.object({
    task_id: z.string(),
    clinical_question: z.string(),
    trials_consulted: z.array(z.string()),
    files_read: z.array(z.string()),
    findings: z.string(),
    safety_flags: z.array(z.string()),
    confidence: z.enum(["high", "medium", "low"]),
    data_gaps: z.array(z.string()),
});
export type ResearchFindings = z.infer<typeof ResearchFindingsSchema>;

export const CriticEvaluationSchema = z.object({
    task_id: z.string().optional(),
    decision: z.enum(["accept", "reject_with_feedback", "escalate"]),
    accuracy_score: z.number().min(0).max(5),
    completeness_score: z.number().min(0).max(5),
    safety_score: z.number().min(0).max(5),
    feedback: z.string(),
    safety_flags: z.array(z.string()).default([]),
});

export type CriticEvaluation = z.infer<typeof CriticEvaluationSchema>;

// ── Final report — Orchestrator output ────────────────────────────────────────
export const FinalReportSchema = z.object({
    clinical_question: z.string(),
    summary: z.string(),
    key_findings: z.array(z.string()),
    safety_considerations: z.array(z.string()),
    evidence_strength: z.enum(["strong", "moderate", "weak", "insufficient"]),
    limitations: z.array(z.string()),
    iterations_required: z.number(),
    status: z.enum(["complete", "partial", "escalated"]),
});
export type FinalReport = z.infer<typeof FinalReportSchema>;