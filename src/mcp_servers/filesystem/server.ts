import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import path from "path";
import fs from "fs";
import { z } from "zod";

const BASE_DIR = path.join(process.cwd(), "literature")

function safePath(requestedPath: string):string | null{
        const resolved = path.resolve(BASE_DIR, requestedPath)
        if (!resolved.startsWith(BASE_DIR)){
        return null; // path traversal attempt
        }

    return resolved
}

function getAllFiles(dirPath: string, files: string[] = []): string[] {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            getAllFiles(fullPath, files);
        } else {
            files.push(fullPath);
        }
    }
    return files;
}

const server = new McpServer({
 name: "clinical-filesystem",
    version: "1.0.0",})


server.tool("read_file", "Read a particular given file", {filePath: z.string().describe("the path to the file that needs to be read")},
async({filePath})=>{
    try{
        const resolved = safePath(filePath);
if (!resolved) {
    return {
        content: [{ type: "text", text: "Error: path traversal attempt blocked" }],
        isError: true
    };
}
const file_content = fs.readFileSync(resolved, "utf-8");

return {
                content: [{type: "text", text:file_content}]
}

    }catch(error){
        return {
            content:[{type:"text", text:`Error: ${error}`}], isError:true
        }

    }


}
)

server.tool("write_file", "Write content to a particular file", {filePath: z.string().describe("Path to file to be written to"), write_content:z.string().describe("content to be written")},


async({filePath, write_content})=>{
    
    try{

        const resolved= safePath(filePath)
        if(!resolved){
            return {
                content:[{type: "text", text:`Error: Path traversal attempt blocked`}], isError: true
            }
        }
        const dir = path.dirname(resolved);
if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
}
        fs.writeFileSync(resolved,write_content)
        return{
            content:[{type: "text", text:"File written"}]
        }
    }catch(error){
        return {
            content:[{type:"text", text: `Error: ${error}`}],
            isError: true
        }
    }
}
)
server.tool("list_directory", "List files and folders in a directory",
    { dirPath: z.string().default(".").describe("Directory path relative to literature/") },
    async ({ dirPath }) => {
        try {
            const resolved = safePath(dirPath);
            if (!resolved) {
                return {
                    content: [{ type: "text", text: "Error: path traversal attempt blocked" }],
                    isError: true
                };
            }

            if (!fs.existsSync(resolved)) {
                return {
                    content: [{ type: "text", text: `Error: directory ${dirPath} does not exist` }],
                    isError: true
                };
            }

            const entries = fs.readdirSync(resolved, { withFileTypes: true });
            const result = entries.map(entry => ({
                name: entry.name,
                type: entry.isDirectory() ? "directory" : "file"
            }));

            return {
                content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
            };
        } catch (error) {
            return {
                content: [{ type: "text", text: `Error: ${error}` }],
                isError: true
            };
        }
    }
)

server.tool("search_files", "Search all literature files for a pattern",
    { pattern: z.string().describe("The search term to look for") },
    async ({ pattern }) => {
        // 1. get all files with getAllFiles(BASE_DIR)
        try{
            const all_files = getAllFiles(BASE_DIR)
            

            const matches: string[] = [];
for (const file of all_files) {
    const content = fs.readFileSync(file, "utf-8");
    if (content.includes(pattern)) {
        matches.push(file);
    }
}
    
            return{
                content:[{
                    type:"text", text: JSON.stringify(matches, null, 2)

                }]
            }
            // I dont know how to serach the pattern 
        }catch(error){
            return{
                content:[{
                    type:"text", text:`Error: ${error}`
                }], isError:true
            }
        }
        // 2. loop through each file
        // 3. read each file's content
        // 4. check if content includes the pattern
        // 5. if match found, add to results array
        // 6. return all matches
    }
)

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Clinical filesystem MCP server running on stdio");
}

main().catch(console.error);