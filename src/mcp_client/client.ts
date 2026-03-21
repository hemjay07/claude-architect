import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "path";
import fs from "fs";

const AUDIT_LOG_PATH = path.join(process.cwd(), "src/mcp_client/audit_log.json");

function logAudit(server: string, tool: string, inputs: unknown, outputSize: number, latencyMs: number) {
    const entry = {
        timestamp: new Date().toISOString(),
        server,
        tool,
        inputs,
        outputSize,
        latencyMs
    };
    const existing = fs.existsSync(AUDIT_LOG_PATH)
        ? JSON.parse(fs.readFileSync(AUDIT_LOG_PATH, "utf-8"))
        : [];
    existing.push(entry);
    fs.writeFileSync(AUDIT_LOG_PATH, JSON.stringify(existing, null, 2));
}

 export class MCPClient {
    private dbClient: Client;
    private fsClient: Client;
    private toolRegistry: Map<string, string> = new Map();
    private connected = false;
    private toolDefinitions: Map<string, any> = new Map();


    constructor() {
        this.dbClient = new Client({
            name: "clinical-research-agent",
            version: "1.0.0"
        });
        this.fsClient = new Client({
            name: "clinical-research-agent",
            version: "1.0.0"
        });
    }

     async connect(){
        const dbTransport= new StdioClientTransport({
            command: "node",
            args: [path.join(process.cwd(), "dist/src/mcp_servers/database/server.js")]
        })

        const fsTransport = new StdioClientTransport({
            command:"node",
            args:[path.join(process.cwd(),"dist/src/mcp_servers/filesystem/server.js" )]
        })

        await this.dbClient.connect(dbTransport)
        await this.fsClient.connect(fsTransport)


        // Build tool registry

        const dbTools = await this.dbClient.listTools()


        for (const tool of dbTools.tools){
            this.toolRegistry.set(`db__${tool.name}`, "db")
            this.toolDefinitions.set(`db__${tool.name}`, {
                name: `db__${tool.name}`,
                description: tool.description,
                input_schema: tool.inputSchema,
            });
        }

        const fsTools = await this.fsClient.listTools()
        for (const tool of fsTools.tools){
            this.toolRegistry.set(`fs__${tool.name}`,"fs")
            this.toolDefinitions.set(`fs__${tool.name}`, {
                name: `fs__${tool.name}`,
                description: tool.description,
                input_schema: tool.inputSchema,
            });
        }

        this.connected = true
        console.log(`Connected. Tool registry: ${[...this.toolRegistry.keys()].join(", ")}`);
    }


   async callTool(namespacedTool: string, args:Record<string, unknown>){
    if(!this.connected){
        throw new Error("MCPClient is not connected, call connect() first")
    }

    const server = this.toolRegistry.get(namespacedTool)
    if(!server){
        throw new Error(`Unknown tool: ${namespacedTool}. Available: ${[...this.toolRegistry.keys()].join(", ")}`);
    }
    const toolName = namespacedTool.split("__")[1]
    const start = Date.now()

    const client = server === "db" ? this.dbClient : this.fsClient
    const result = await client.callTool({name: toolName, arguments:args})

    const outputSize = JSON.stringify(result).length
    logAudit(server, toolName, args,outputSize, Date.now() - start)

    return result
    }

    getAvailableTools(): string[] {
    return [...this.toolRegistry.keys()];
    }

    getToolDefinitions(): any[] {
    return [...this.toolDefinitions.values()];
}

    async disconnect() {
    await this.dbClient.close();
    await this.fsClient.close();
    this.connected = false;
    }
}