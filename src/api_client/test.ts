import "dotenv/config";
import { AnthropicClient } from "./client";

async function test() {
    const client = new AnthropicClient();

    console.log("--- Testing complete() ---");
    const response = await client.complete([
        { role: "user", content: "Say exactly: Hello from Claude" }
    ]);
    console.log("Response:", response.content[0]);
    console.log("Stop reason:", response.stop_reason);
    console.log("Usage:", response.usage);

    console.log("\n--- Testing stream() ---");
    process.stdout.write("Streamed: ");
    for await (const chunk of client.stream([
        { role: "user", content: "Count from 1 to 5, one number per word" }
    ])) {
        process.stdout.write(chunk);
    }
    console.log("\nStream complete");
}

test().catch(console.error);

