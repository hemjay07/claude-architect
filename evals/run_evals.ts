import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { AnthropicClient } from "../src/api_client/client";
import { MCPClient } from "../src/mcp_client/client";
import { runOrchestrator } from "../src/agents/orchestrator";
import { judgeResponse, JudgeResult } from "./judge";

const BASELINE_PATH = path.join(process.cwd(), "evals/baseline.json");
const RESULTS_PATH = path.join(process.cwd(), "evals/latest_results.json");
const DATASET_PATH = path.join(process.cwd(), "evals/dataset.jsonl");
const RUNS_DIR = path.join(process.cwd(), "evals/runs");
const REGRESSION_THRESHOLD = 0.5;

// Toggle this to see detailed debug output
const DEBUG = process.argv.includes("--debug");

interface EvalResult {
    test_id: string;
    tier: string;
    question: string;
    judge: JudgeResult;
    mean_score: number;
    status: "pass" | "fail";
    elapsed_seconds: number;
}

interface EvalSummary {
    timestamp: string;
    runtime_minutes: number;
    total: number;
    passed: number;
    failed: number;
    mean_correctness: number;
    mean_completeness: number;
    mean_safety: number;
    overall_mean: number;
    results: EvalResult[];
}

function loadDataset(): any[] {
    const lines = fs.readFileSync(DATASET_PATH, "utf-8").trim().split("\n");
    return lines.map(line => JSON.parse(line));
}

function mean(nums: number[]): number {
    return nums.reduce((a, b) => a + b, 0) / nums.length;
}

async function runSingleEval(
    testCase: any,
    mcpClient: MCPClient,
    anthropicClient: AnthropicClient
): Promise<EvalResult> {
    const startTime = Date.now();

    console.log(`  [${testCase.id}] ${testCase.tier}: ${testCase.question.slice(0, 60)}...`);

    let agentResponse = "";
    try {
        const report = await runOrchestrator(
            testCase.question,
            mcpClient,
            anthropicClient
        );

        agentResponse = report.summary;

        if (report.safety_considerations.length > 0) {
            agentResponse += "\nSafety: " + report.safety_considerations.join("; ");
        }
        if (report.limitations.length > 0) {
            agentResponse += "\nLimitations: " + report.limitations.join("; ");
        }
    } catch (error) {
        agentResponse = `Error: ${error}`;
    }

    // Debug: show what the agent produced before it goes to the judge
    if (DEBUG) {
        console.log(`  [DEBUG] Agent response length: ${agentResponse.length}`);
        console.log(`  [DEBUG] Agent response preview: ${agentResponse.substring(0, 500)}`);
        console.log(`  [DEBUG] ---`);
    }

    const judgeResult = await judgeResponse(testCase, agentResponse, DEBUG);
    const meanScore = mean([
        judgeResult.correctness,
        judgeResult.completeness,
        judgeResult.safety
    ]);

    const status = meanScore >= 3.0 ? "pass" : "fail";
    const elapsed = (Date.now() - startTime) / 1000;

    console.log(`    → Scores: C:${judgeResult.correctness}/5 Co:${judgeResult.completeness}/5 S:${judgeResult.safety}/5 | ${status.toUpperCase()}`);

    return {
        test_id: testCase.id,
        tier: testCase.tier,
        question: testCase.question,
        judge: judgeResult,
        mean_score: meanScore,
        status,
        elapsed_seconds: parseFloat(elapsed.toFixed(1))
    };
}

function buildSummary(results: EvalResult[], runtimeMinutes: number): EvalSummary {
    const passed = results.filter(r => r.status === "pass").length;
    return {
        timestamp: new Date().toISOString(),
        runtime_minutes: runtimeMinutes,
        total: results.length,
        passed,
        failed: results.length - passed,
        mean_correctness: mean(results.map(r => r.judge.correctness)),
        mean_completeness: mean(results.map(r => r.judge.completeness)),
        mean_safety: mean(results.map(r => r.judge.safety)),
        overall_mean: mean(results.map(r => r.mean_score)),
        results
    };
}

function detectRegressions(current: EvalSummary, baseline: EvalSummary): string[] {
    const regressions: string[] = [];

    const dims = ["mean_correctness", "mean_completeness", "mean_safety", "overall_mean"] as const;
    for (const dim of dims) {
        const drop = baseline[dim] - current[dim];
        if (drop > REGRESSION_THRESHOLD) {
            regressions.push(`${dim}: dropped from ${baseline[dim].toFixed(2)} to ${current[dim].toFixed(2)} (drop: ${drop.toFixed(2)})`);
        }
    }

    return regressions;
}

async function main() {
    const args = process.argv.slice(2);
    const runAll = args.includes("--all");
    const tierId = args.find(a => a.startsWith("--tier="))?.split("=")[1];
    const caseId = args.find(a => a.startsWith("--case="))?.split("=")[1];

    const anthropicClient = new AnthropicClient();
    const mcpClient = new MCPClient();

    console.log("Starting MCP servers...");
    await mcpClient.connect();

    const dataset = loadDataset();
    let testCases = dataset;

    if (caseId) {
        // --case= takes priority over everything else
        testCases = dataset.filter(t => t.id === caseId);
        console.log(`Running single case: ${caseId}`);
    } else if (tierId) {
        testCases = dataset.filter(t => t.tier === tierId);
        console.log(`Running ${testCases.length} cases for tier: ${tierId}`);
    } else if (runAll) {
        console.log(`Running full suite: ${testCases.length} cases`);
    } else {
        // Default: run 5 cases for speed
        testCases = [
            dataset.find(t => t.id === "t01"),
            dataset.find(t => t.id === "t05"),
            dataset.find(t => t.id === "t11"),
            dataset.find(t => t.id === "t15"),
            dataset.find(t => t.id === "t21"),
        ].filter(Boolean);
        console.log("Running 5 sample cases. Use --all for full suite.");
    }

    if (DEBUG) {
        console.log(`[DEBUG MODE ENABLED]`);
    }

    console.log("\n══════════════════════════════════════");
    console.log("EVAL RUN");
    console.log("══════════════════════════════════════\n");

    // ── Per-case timing with running ETA ──────────────────────────────────
    const suiteStart = Date.now();
    const results: EvalResult[] = [];

    for (let i = 0; i < testCases.length; i++) {
        const result = await runSingleEval(testCases[i], mcpClient, anthropicClient);
        results.push(result);

        const totalElapsed = (Date.now() - suiteStart) / 1000;
        const avgPerCase = totalElapsed / (i + 1);
        const remaining = avgPerCase * (testCases.length - (i + 1));
        const remainingMin = (remaining / 60).toFixed(1);
        console.log(`    ⏱ ${result.elapsed_seconds}s | ETA: ${remainingMin}min remaining (${i + 1}/${testCases.length})\n`);
    }

    // ── Total suite time ──────────────────────────────────────────────────
    const suiteElapsed = (Date.now() - suiteStart) / 1000 / 60;
    const runtimeMinutes = parseFloat(suiteElapsed.toFixed(1));
    console.log(`\nTotal runtime: ${runtimeMinutes} minutes`);

    const summary = buildSummary(results, runtimeMinutes);

    // ── Save timestamped results ──────────────────────────────────────────
    if (!fs.existsSync(RUNS_DIR)) {
        fs.mkdirSync(RUNS_DIR, { recursive: true });
    }
    const runTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const runPath = path.join(RUNS_DIR, `${runTimestamp}.json`);
    fs.writeFileSync(runPath, JSON.stringify(summary, null, 2));
    fs.writeFileSync(RESULTS_PATH, JSON.stringify(summary, null, 2));
    console.log(`Results saved: evals/runs/${runTimestamp}.json`);

    // ── Print summary ─────────────────────────────────────────────────────
    console.log("\n══════════════════════════════════════");
    console.log("SUMMARY");
    console.log("══════════════════════════════════════");
    console.log(`Total: ${summary.total} | Passed: ${summary.passed} | Failed: ${summary.failed}`);
    console.log(`Correctness: ${summary.mean_correctness.toFixed(2)}/5`);
    console.log(`Completeness: ${summary.mean_completeness.toFixed(2)}/5`);
    console.log(`Safety: ${summary.mean_safety.toFixed(2)}/5`);
    console.log(`Overall mean: ${summary.overall_mean.toFixed(2)}/5`);
    console.log(`Runtime: ${summary.runtime_minutes} minutes`);

    // Worst performing cases
    const worst = results.sort((a, b) => a.mean_score - b.mean_score).slice(0, 3);
    console.log("\nWorst performing cases:");
    worst.forEach(r => console.log(`  ${r.test_id} (${r.tier}): ${r.mean_score.toFixed(2)}/5 [${r.elapsed_seconds}s] — ${r.judge.reasoning}`));

    // ── Regression detection ──────────────────────────────────────────────
    if (fs.existsSync(BASELINE_PATH)) {
        const baseline: EvalSummary = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf-8"));
        const regressions = detectRegressions(summary, baseline);
        if (regressions.length > 0) {
            console.log("\n⚠ REGRESSIONS DETECTED:");
            regressions.forEach(r => console.log(`  - ${r}`));
            await mcpClient.disconnect();
            process.exit(1);
        } else {
            console.log("\n✓ No regressions vs baseline");
        }
    } else {
        console.log("\n⚠ No baseline found. Review results, then run:");
        console.log("  cp evals/latest_results.json evals/baseline.json");
    }

    await mcpClient.disconnect();
    console.log("\nDone.");
}

main().catch(console.error);