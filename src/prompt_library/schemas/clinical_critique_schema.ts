import { z } from "zod";

export const ClinicalCritiqueSchema = z.object({
    decision:            z.enum(["accept", "reject_with_feedback", "escalate"]),
    accuracy_score:      z.number().min(0).max(5),
    completeness_score:  z.number().min(0).max(5),
    safety_score:        z.number().min(0).max(5),
    feedback:            z.string(),
    safety_flags:        z.array(z.string()).default([]),
});

export type ClinicalCritique = z.infer<typeof ClinicalCritiqueSchema>;