import {z} from "zod"

export const ClinicalSynthesisSchema = z.object({
    clinical_question:    z.string(),
    trials_reviewed:      z.array(z.string()),
    total_participants:   z.number().optional(),
    population_summary:   z.string(),
    key_findings:         z.array(z.object({
        trial:         z.string(),
        outcome:       z.string(),
        result:        z.string(),
        effect_size:   z.string().optional(),
        significance:  z.string().optional(),
    })),
    evidence_strength:    z.enum(["strong", "moderate", "weak", "insufficient"]),
    safety_considerations: z.array(z.string()),
    limitations:          z.array(z.string()),
    recommendation:       z.string(),
    citations:            z.array(z.string()),
});

export type ClinicalSynthesis = z.infer<typeof ClinicalSynthesisSchema>;