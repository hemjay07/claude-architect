import "dotenv/config";
import { AnthropicClient } from "../../api_client/client";
import { loadPrompt } from "../../prompt_library/prompt_loader";
import { validateOutput } from "../../prompt_library/schema_validator";
import { ClinicalRouterSchema } from "../../prompt_library/schemas/clinical_router_schema";
import { ClinicalExtractionSchema } from "../../prompt_library/schemas/clinical_extraction_schema";
import { ClinicalCritiqueSchema } from "../../prompt_library/schemas/clinical_critique_schema";
import { ClinicalSynthesisSchema } from "../../prompt_library/schemas/clinical_synthesis_schema";

const TEST_CASES = [
    {
        promptName: "clinical_router",
        version: "1.1.0",
        input: "What was the primary endpoint of SUSTAIN-6?",
        schema: ClinicalRouterSchema,
    },
    {
        promptName: "clinical_extraction",
        version: "1.0.0",
        input: "In the LEADER trial, liraglutide was evaluated in 9,340 patients with T2DM at high CV risk. Primary endpoint was 3-point MACE. HR 0.87 (95% CI 0.78-0.97), p=0.01.",
        schema: ClinicalExtractionSchema,
    },
    {
        promptName: "clinical_critique",
        version: "1.0.0",
        input: "TASK: What did LEADER show about liraglutide CV outcomes?\nRESEARCHER OUTPUT: LEADER demonstrated liraglutide reduced 3-point MACE vs placebo. HR 0.87 (95% CI 0.78-0.97), p=0.01 in 9,340 patients with T2DM at high CV risk.",
        schema: ClinicalCritiqueSchema,
    },
    {
        promptName: "clinical_synthesis",
        version: "1.0.0",
        input: "clinical_question: What does LEADER show about liraglutide CV outcomes?\n\nretrieved_passages:\n[P1] LEADER trial: 9,340 patients with T2DM at high CV risk. Primary endpoint 3-point MACE. HR 0.87 (95% CI 0.78-0.97), p=0.01 for superiority.",
        schema: ClinicalSynthesisSchema,
    },
];


async function runRegression() {
    const client = new AnthropicClient();
    let passed = 0;
    let failed = 0;

    for (const test of TEST_CASES) {
        try {
            // 1. Load the prompt

            const prompt = loadPrompt(test.promptName, test.version)
            // 2. Call client.complete() with the test input as user message
            const response = await client.complete(
                [{role:"user", content: test.input}],{
                    system: prompt.system,
                    model: prompt.model_target,
                    thinking: prompt.thinking,
                    thinkingBudget:prompt.thinking_budget
                }
            )

const textBlock = response.content.find(block => block.type === "text");
const rawText = textBlock && textBlock.type === "text" ? textBlock.text : "";
            const result = validateOutput(rawText, test.schema as any)
           if (result.valid) {
    passed++;
    console.log(`PASS [${test.promptName}]`);
} else {
    failed++;
    console.log(`FAIL [${test.promptName}] — ${result.error}`);
}
        } catch (error) {
            console.log(`FAIL [${test.promptName}] — unexpected error: ${error}`);
            failed++;
        }
    }

    console.log(`\n${passed + failed} tests — ${passed} passed, ${failed} failed`);
    
    if (failed > 0) process.exit(1);
}

runRegression();