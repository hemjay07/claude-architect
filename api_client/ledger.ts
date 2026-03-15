import Database, {Database as DatabaseType} from "better-sqlite3"

export interface UsageRecord {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number
}

const PRICING: Record<string, {
    input: number;
    output:number;
    cacheRead: number;
    cacheWrite: number
}> = {
    "claude-opus-4-6":{
        input:5.00, output: 25.00, cacheRead:0.50, cacheWrite: 6.25
    }, 
    "claude-sonnet-4-6":{
        input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75
    },
    "claude-haiku-4-5-20251001":{
        input: 1.00, output: 5.00, cacheRead: 0.1, cacheWrite: 1.25
    }
}

export class UsageLedger{
    private db: DatabaseType;

    constructor(dbPath: string="./usage.db"){
        this.db = new Database(dbPath)

        this.db.exec(`
                    CREATE TABLE IF NOT EXISTS usage(
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    model TEXT NOT NULL,
                    input_tokens INTEGER NOT NULL,
                    output_tokens INTEGER NOT NULL,
                    cache_read_tokens  INTEGER NOT NULL,
                    cache_write_tokens     INTEGER NOT NULL,
                    cost_usd    REAL NOT NULL  )      
                    `)

    }

    record(model: string, usage: UsageRecord){

       const pricing = PRICING[model]

        if(!pricing){
            console.warn(`UsageLedger: unknown model "${model}", cost recorded as 0`)
        }


        const costUsd = pricing ? (
            (usage.inputTokens      * pricing.input      / 1_000_000) +
            (usage.outputTokens     * pricing.output     / 1_000_000) +
            (usage.cacheReadTokens  * pricing.cacheRead  / 1_000_000) +
            (usage.cacheWriteTokens * pricing.cacheWrite / 1_000_000)
        ) : 0;

        const stmt = this.db.prepare(
            ` 
            INSERT INTO usage(
            timestamp, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd)
            VALUES(?,?,?,?,?,?,?)
            `
        )

        stmt.run(
            new Date().toISOString(),
            model,
            usage.inputTokens,
            usage.outputTokens,
            usage.cacheReadTokens,
            usage.cacheWriteTokens, 
            costUsd
        )
    }
}