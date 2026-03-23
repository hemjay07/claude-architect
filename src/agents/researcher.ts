import Anthropic from "@anthropic-ai/sdk";
import { MCPClient } from "../mcp_client/client";
import { validateOutput } from "../prompt_library/schema_validator";
import { ResearchTask, ResearchFindings, ResearchFindingsSchema } from "./types";

const RESEARCHER_SYSTEM = `You are a clinical research analyst specialising in GLP-1 receptor agonists.

For each research task:
1. Search the literature using rag__search with a relevant clinical query — this is your PRIMARY tool for finding evidence
2. Query the trials database for quantitative data using db__query_db
3. Use db__list_tables and db__describe_table to understand the database structure if needed
4. Only use fs__read_file for specific files if RAG search results reference them and you need more context
5. When you have sufficient evidence, stop gathering and return your findings
6. Flag any safety signals relevant to the question

Return your findings as a JSON object as soon as you have enough data — do not over-gather.
Never extrapolate beyond what the data shows. If data is missing, say so explicitly.
If a question asks about a specific trial by name and your search results do not contain data from that trial, explicitly state that the trial was not found in your data sources. Do not substitute data from other trials.`;

export async function runResearcher(
    task: ResearchTask,
    mcpClient: MCPClient,
    anthropicClient: Anthropic
): Promise<ResearchFindings> {

    const availableTools = mcpClient.getToolDefinitions();

    const messages: Anthropic.MessageParam[] = [
        {
            role: "user",
            content: `<research_task>
Clinical question: ${task.clinical_question}
Subtask: ${task.subtask}
${task.context ? `Context: ${task.context}` : ""}
</research_task>

Start by searching the literature with rag__search for relevant evidence.
Then query the trials database with db__query_db for quantitative outcomes.
Stop gathering once you have sufficient evidence.`
        }
    ];

    let toolCallCount = 0;
    const MAX_TOOL_CALLS = 20;

    while (toolCallCount < MAX_TOOL_CALLS) {
        const response = await anthropicClient.messages.create({
            model: "claude-sonnet-4-6",
            max_tokens: 8192,
            system: RESEARCHER_SYSTEM,
            tools: availableTools as any,
            messages,
        });


        messages.push({ role: "assistant", content: response.content });

        if (response.stop_reason === "end_turn") {
            break;
        }
        if (response.stop_reason === "max_tokens") {
            break;
        }

        if (response.stop_reason === "tool_use") {
            const toolResults: Anthropic.ToolResultBlockParam[] = [];

            for (const block of response.content) {
                if (block.type === "tool_use") {
                    toolCallCount++;
                    try {
                        const result = await mcpClient.callTool(
                            block.name,
                            block.input as Record<string, unknown>
                        );
                        const content = (result as any).content;
                        const firstContent = content[0] as { type: string; text?: string };

                        toolResults.push({
                            type: "tool_result",
                            tool_use_id: block.id,
                            content: firstContent.type === "text"
                                ? firstContent.text ?? ""
                                : JSON.stringify(result.content),
                        });
                    } catch (error) {
                        toolResults.push({
                            type: "tool_result",
                            tool_use_id: block.id,
                            content: `Error: ${error}`,
                            is_error: true,
                        });
                    }
                }
            }

            messages.push({ role: "user", content: toolResults });
        }
    }

    // Collect all tool results from message history
    const toolResultsSummary: string[] = [];
    for (const msg of messages) {
        if (msg.role === "user" && Array.isArray(msg.content)) {
            for (const block of msg.content) {
                if (typeof block === "object" && "type" in block && block.type === "tool_result") {
                    const content = (block as any).content;
                    if (typeof content === "string" && content.length > 0) {
                        toolResultsSummary.push(content.slice(0, 500));
                    }
                }
            }
        }
    }

    // Explicit synthesis call with no tools — clean context
    const synthesisResponse = await anthropicClient.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: "You are a clinical data synthesizer. You receive raw tool results and synthesize them into structured findings. Return ONLY a valid JSON object, no preamble, no markdown.",
        messages: [{
            role: "user",
            content: `Based on this gathered data, synthesize findings for the question: "${task.clinical_question}"

GATHERED DATA:
${toolResultsSummary.join("\n---\n")}

Return ONLY this JSON structure:
{
  "task_id": "${task.task_id}",
  "clinical_question": "${task.clinical_question}",
  "trials_consulted": ["trial names mentioned in data"],
  "files_read": ["file paths accessed"],
  "findings": "comprehensive synthesis of the evidence",
  "safety_flags": ["safety concerns identified"],
  "confidence": "high|medium|low",
  "data_gaps": ["missing data points"]
}`
        }]
    });

    const textBlock = synthesisResponse.content.find(b => b.type === "text");
    let rawOutput = textBlock && textBlock.type === "text" ? textBlock.text : "";


    const validation = validateOutput(rawOutput, ResearchFindingsSchema);
    if (validation.valid && validation.data) {
        return validation.data;
    }

    // Fallback if validation fails
    return {
        task_id: task.task_id,
        clinical_question: task.clinical_question,
        trials_consulted: [],
        files_read: [],
        findings: rawOutput || "Researcher could not complete the task.",
        safety_flags: [],
        confidence: "low",
        data_gaps: ["Complete response could not be validated"],
    };
}