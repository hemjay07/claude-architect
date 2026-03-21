import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { MCPClient } from "../mcp_client/client";
import { runOrchestrator } from "./orchestrator";

async function main() {
    const anthropicClient = new Anthropic();
    const mcpClient = new MCPClient();

    console.log("Starting MCP servers...");
    await mcpClient.connect();

    const question = "What does the evidence show about semaglutide cardiovascular outcomes in patients with type 2 diabetes?";

    try {
        const report = await runOrchestrator(question, mcpClient, anthropicClient);

        console.log("\n══════════════════════════════════════");
        console.log("FINAL REPORT");
        console.log("══════════════════════════════════════");
        console.log(`Question: ${report.clinical_question}`);
        console.log(`Status: ${report.status}`);
        console.log(`Iterations: ${report.iterations_required}`);
        console.log(`Evidence strength: ${report.evidence_strength}`);
        console.log(`\nSummary:\n${report.summary}`);
        console.log(`\nSafety considerations:`);
        report.safety_considerations.forEach(s => console.log(`  - ${s}`));
        console.log(`\nLimitations:`);
        report.limitations.forEach(l => console.log(`  - ${l}`));

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await mcpClient.disconnect();
    }
}

main().catch(console.error);