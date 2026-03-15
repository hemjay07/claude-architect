import { z } from "zod";

export const ClinicalRouterSchema = z.object({
    category:   z.enum([
        "EFFICACY",
        "SAFETY", 
        "MECHANISM",
        "COMPARISON",
        "POPULATION",
        "OUT_OF_SCOPE"
    ]),
    confidence: z.number().min(0).max(1),
});

export type ClinicalRouterOutput = z.infer<typeof ClinicalRouterSchema>;