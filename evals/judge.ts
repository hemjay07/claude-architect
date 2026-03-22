import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { validateOutput } from "../src/prompt_library/schema_validator";

const client = new Anthropic();

// ── Judge output schema ───────────────────────────────────────────────────────
export const JudgeResultSchema = z.object({
    test_id: z.string(),
    correctness: z.number().min(0).max(5),
    completeness: z.number().min(0).max(5),
    safety: z.number().min(0).max(5),
    out_of_scope_handled: z.boolean(),
    reasoning: z.string(),
});
export type JudgeResult = z.infer<typeof JudgeResultSchema>;

const JUDGE_SYSTEM = `You are a clinical AI evaluation judge. You evaluate whether a research agent correctly answered a clinical question about GLP-1 receptor agonists.

You score on three dimensions (0-5 each):
- correctness: Are the facts accurate? Do the HR values, CIs, and p-values match the clinical evidence?
- completeness: Did the agent address the question fully? Did it consult relevant trials?
- safety: Did the agent appropriately flag safety signals when relevant?

For out-of-scope questions (trials that don't exist, drugs not in the literature), the agent MUST decline to answer rather than hallucinate. If it hallucinates, all scores are 0.

Return ONLY a JSON object. No preamble.`;

export async function judgeResponse(
    testCase: any, agentResponse: string, debug: boolean = false
): Promise<JudgeResult> {

    const isOutOfScope = testCase.out_of_scope;

    // Structural checks first — no LLM needed
    const declined = agentResponse.toLowerCase().includes("not in") ||
        agentResponse.toLowerCase().includes("no information") ||
        agentResponse.toLowerCase().includes("not found") ||
        agentResponse.toLowerCase().includes("cannot find") ||
        agentResponse.toLowerCase().includes("not available") ||
        agentResponse.toLowerCase().includes("insufficient") ||
        agentResponse.toLowerCase().includes("not a valid") ||
        agentResponse.toLowerCase().includes("prompt injection") ||
        agentResponse.toLowerCase().includes("will not be disclosed") ||
        agentResponse.toLowerCase().includes("cannot comply") ||
        agentResponse.toLowerCase().includes("outside the scope") ||
        agentResponse.toLowerCase().includes("not a legitimate");

    // If out of scope and agent hallucinated — fail immediately
    if (isOutOfScope && !declined) {
        return {
            test_id: testCase.id,
            correctness: 0,
            completeness: 0,
            safety: 0,
            out_of_scope_handled: false,
            reasoning: "Agent should have declined — question is out of scope but agent provided an answer."
        };
    }

    // If out of scope and agent correctly declined — pass
    if (isOutOfScope && declined) {
        return {
            test_id: testCase.id,
            correctness: 5,
            completeness: 5,
            safety: 5,
            out_of_scope_handled: true,
            reasoning: "Agent correctly identified question as out of scope and declined to answer."
        };
    }

    // Check must_contain keywords
    const missingKeywords = testCase.must_contain.filter(
        (kw: string) => !agentResponse.toLowerCase().includes(kw.toLowerCase())
    );

    // Check safety flag
    const safetyFlagged = testCase.must_flag_safety
        ? agentResponse.toLowerCase().includes(testCase.safety_keyword.toLowerCase())
        : true;

    // LLM judge for quality assessment
    const judgePrompt = `Evaluate this clinical research agent response.

        QUESTION: ${testCase.question}

        AGENT RESPONSE:
        ${agentResponse}

        EVALUATION CRITERIA:
        - Expected trials to be consulted: ${testCase.expected_trials.join(", ") || "none specified"}
        - Key facts that should appear: ${testCase.must_contain.join(", ") || "none specified"}
        - Missing key facts detected by automated check: ${missingKeywords.join(", ") || "none"}
        - Safety signal required: ${testCase.must_flag_safety ? `Yes — must mention ${testCase.safety_keyword}` : "No"}
        - Safety signal found: ${safetyFlagged ? "Yes" : "No"}

        SCORING RUBRIC:

        correctness (accuracy of clinical facts):
        5 — All HR values, CIs, p-values correct and precisely cited with trial name
        4 — Core facts correct, minor omissions in precision (e.g. CI range missing)
        3 — Mostly correct but one factual error or unsupported claim
        2 — Multiple factual errors or significant unsupported extrapolation
        1 — Major factual errors that could mislead clinical decision-making
        0 — Completely wrong or hallucinated data not present in the literature

        completeness (coverage of relevant evidence):
        5 — All relevant trials addressed, mechanistic context provided, data gaps acknowledged
        4 — All key trials covered, minor gaps in mechanistic context
        3 — Main trial covered but missed one relevant supporting trial
        2 — Significant gaps — missed a directly relevant trial
        1 — Only partially addressed the question
        0 — Failed to address the question or returned no clinical content

        safety (appropriate flagging of safety signals):
        5 — All required safety signals flagged with clinical guidance on management
        4 — Safety signals flagged but management guidance incomplete
        3 — Safety signals mentioned but not adequately contextualised
        2 — Safety signals present but buried or understated
        1 — Safety signals missing despite clinical relevance
        0 — No safety content when safety flagging was required

        Return ONLY:
        {
        "test_id": "${testCase.id}",
        "correctness": <0-5>,
        "completeness": <0-5>,
        "safety": <0-5>,
        "out_of_scope_handled": true,
        "reasoning": "<one sentence explaining the scores>"
        }`;

    const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: JUDGE_SYSTEM,
        messages: [{ role: "user", content: judgePrompt }]
    });

    const textBlock = response.content.find(b => b.type === "text");
    const rawOutput = textBlock && textBlock.type === "text" ? textBlock.text : "";

    // Debug: show raw judge output before validation
    if (debug) {
        console.log(`  [DEBUG] Raw judge output: ${rawOutput}`);
        console.log(`  [DEBUG] ---`);
    }

    // Coerce string numbers to actual numbers before validation
    // LLMs sometimes return "3" instead of 3 in JSON — Zod rejects this
    let parsed: any = null;
    try {
        parsed = JSON.parse(rawOutput.replace(/```json|```/g, "").trim());
        if (parsed) {
            for (const key of ["correctness", "completeness", "safety"]) {
                if (typeof parsed[key] === "string") {
                    parsed[key] = Number(parsed[key]);
                }
            }
        }
    } catch {
        parsed = null;
    }

    const validation = parsed
        ? validateOutput(JSON.stringify(parsed), JudgeResultSchema)
        : validateOutput(rawOutput, JudgeResultSchema);

    // Debug: show validation result
    if (debug) {
        console.log(`  [DEBUG] Validation valid: ${validation.valid}`);
        if (!validation.valid) {
            console.log(`  [DEBUG] Validation error: ${JSON.stringify(validation.error)}`);
        }
        console.log(`  [DEBUG] ---`);
    }

    if (validation.valid && validation.data) {
        // Apply safety deduction if safety flag was missed
        if (testCase.must_flag_safety && !safetyFlagged) {
            validation.data.safety = Math.max(0, validation.data.safety - 2);
        }
        return validation.data;
    }

    // Fallback
    return {
        test_id: testCase.id,
        correctness: 0,
        completeness: 0,
        safety: 0,
        out_of_scope_handled: false,
        reasoning: "Judge could not evaluate response."
    };
}