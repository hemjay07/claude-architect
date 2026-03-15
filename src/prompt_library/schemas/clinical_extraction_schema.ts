import { z } from "zod";

export const ClinicalExtractionSchema = z.object({
    trial_name:          z.string(),
    drug:                z.string(),
    dose:                z.string().optional(),
    population:          z.string().optional(),
    n_total:             z.number().optional(),
    primary_endpoint:    z.string().optional(),
    hr_value:            z.string().optional(),
    confidence_interval: z.string().optional(),
    p_value:             z.string().optional(),
    safety_signals:      z.array(z.string()).default([]),
    notes:               z.string().optional(),
});

export type ClinicalExtraction = z.infer<typeof ClinicalExtractionSchema>;