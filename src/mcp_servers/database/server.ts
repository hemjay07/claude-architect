import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs"
import {z} from "zod";


const ALLOW_WRITES = process.argv.includes("--allow-writes");
// Database setup
const DB_PATH = path.join(process.cwd(), "src/mcp_servers/database/clinical_trials.db");
const db = new Database(DB_PATH)

// Invocation log
const LOG_PATH = path.join(process.cwd(), "src/mcp_servers/database/invocation_log.json");

function logInvocation (tool: string, inputs: unknown, outputBytes: number, latencyMs: number, success: boolean){

    const entry= {
        timeStamp: new Date().toISOString(),
        tool, 
        inputs,
        latencyMs,
        outputBytes,
        success
    }

    const existing = fs.existsSync(LOG_PATH)
        ? JSON.parse(fs.readFileSync(LOG_PATH,"utf-8")) :
        []
    existing.push(entry)
    fs.writeFileSync(LOG_PATH, JSON.stringify(existing, null, 2))
}

// server setup
const server = new McpServer({
    name : "clinical-trials-db",
    version: "1.0.0"
})

// Tool: list_tables

server.tool("list_tables",
    "List all tables in the clinical trials database",
    async ()=>{
        const start = Date.now()
        try{
            const table = db.prepare("SELECT name from sqlite_master where type='table'").all();

            const result = JSON.stringify(table)
            logInvocation("list_tables", {}, result.length, Date.now() - start, true)

            return{
                content :[{type: "text", text: result}]
            }

        }catch (error) {
            logInvocation("list_tables", {}, 0, Date.now() - start, false)

            return {
                content: [{type: "text", text: `Error: ${error}`}],
                isError: true
            }
        }
    }
)

server.tool("describe_table", "Get the column names and types for a specific table",{name: z.string().describe("The table name to describe")},
        async ({name})=>{
            const start = Date.now()
            try{
                const columns = db.prepare(`PRAGMA table_info(${name})`).all()

                if ((columns as any[]).length === 0){
                    return {
                        content: [{type: "text", text: `Error: table ${name} does not exist`}],
                        isError: true
                    }
                }

                const result = JSON.stringify(columns)
                
                logInvocation("describe_table", {name}, result.length, Date.now() - start, true)

                return {
                    content: [{type: "text", text:result}]
                }
            }catch(error){
                logInvocation("describe_table", {name}, 0, Date.now() - start,false )
                
                return {
                    content:[{type: "text", text:`Error: ${error}`}],
                    isError: true
                }
            }
        }
)


server.tool(
    "query_db", "Execute a SQL query against the clinical trials database. Use SELECT queries only.",{sql: z.string().describe("The SQL query to execute")},
    async({sql})=>{
        const start = Date.now()
        
        try{
           // Security: only allow SELECT statement
           const trimmed = sql.trim().toUpperCase()
           if (!trimmed.startsWith('SELECT')){
            return{
                content:[{
                    type: "text", text:"Error: only SELECT queries are permitted", isError: true
                }]
            }
           }
           const rows= db.prepare(sql).all()
           const result = JSON.stringify(rows)
           logInvocation("query_db", {sql}, result.length, Date.now() - start, true)

           return {
            content:[{
                type: "text", text: result
            }]
           }

        }catch(error){
            logInvocation("query_db", {sql}, 0, Date.now() - start, false)

            return {
                content:[{
                    type: "text", text:   `Error: ${error}`,
                }], isError:true
                
            }
        }
    }
)

server.tool(
    "insert_record",
    "Insert a record into a database table. Requires allow_writes to be enabled.",
    {
        table: z.string().describe("The table to insert into"),
        data: z.record(z.string(), z.unknown()).describe("The record data as a key-value object")
    },
    async ({ table, data }) => {
        const start = Date.now();
        try {
            if (!ALLOW_WRITES) {
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({
                            code: "WRITE_DISABLED",
                            message: "Write operations are disabled. Start server with --allow-writes to enable.",
                            recoverable: false
                        })
                    }],
                    isError: true
                };
            }

            const columns = Object.keys(data);
            const placeholders = columns.map(() => "?").join(", ");
            const values = Object.values(data);

            const stmt = db.prepare(
                `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`
            );
            const result = stmt.run(...values);

            const output = JSON.stringify({ success: true, changes: result.changes });
            logInvocation("insert_record", { table, data }, output.length, Date.now() - start, true);

            return {
                content: [{ type: "text", text: output }]
            };
        } catch (error) {
            logInvocation("insert_record", { table, data }, 0, Date.now() - start, false);
            return {
                content: [{ type: "text", text: `Error: ${error}` }],
                isError: true
            };
        }
    }
);

// ── Resource: database schema ─────────────────────────────────────────────────
server.resource(
    "schema",
    "schema://database",
    async (uri) => {
        const tables = db.prepare(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).all() as { name: string }[];

        let schema = "";
        for (const table of tables) {
            const columns = db.prepare(
                `PRAGMA table_info(${table.name})`
            ).all() as { name: string; type: string }[];
            
            schema += `TABLE: ${table.name}\n`;
            for (const col of columns) {
                schema += `  ${col.name} (${col.type})\n`;
            }
            schema += "\n";
        }

        return {
            contents: [{
                uri: uri.href,
                mimeType: "text/plain",
                text: schema
            }]
        };
    }
);

// ── Resource: recent logs ─────────────────────────────────────────────────────
server.resource(
    "logs",
    "logs://recent",
    async (uri) => {
        const logs = fs.existsSync(LOG_PATH)
            ? JSON.parse(fs.readFileSync(LOG_PATH, "utf-8"))
            : [];
        
        const recent = logs.slice(-50);

        return {
            contents: [{
                uri: uri.href,
                mimeType: "application/json",
                text: JSON.stringify(recent, null, 2)
            }]
        };
    }
);

// ── Prompt: data analysis task ────────────────────────────────────────────────
server.prompt(
    "data_analysis_task",
    "A reusable prompt template for analyzing clinical trial data",
    {
        table_name: z.string().describe("The table to analyze"),
        goal: z.string().describe("What you want to find out")
    },
    async ({ table_name, goal }) => {
        return {
            messages: [{
                role: "user",
                content: {
                    type: "text",
                    text: `You are analyzing the ${table_name} table in a clinical trials database.\n\nYour goal: ${goal}\n\nStart by describing the table structure, then write and execute the appropriate SQL queries to answer the question. Always cite the specific rows that support your conclusions.`
                }
            }]
        };
    }
);

// ── Start server ──────────────────────────────────────────────────────────────
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Clinical trials database MCP server running on stdio");
}

main().catch(console.error);