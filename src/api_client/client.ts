import "dotenv/config";

import Anthropic from "@anthropic-ai/sdk";
import { UsageLedger, UsageRecord } from "./ledger";

export class AnthropicClient {
    private client :Anthropic;
    private ledger:UsageLedger;
    private defaultModel : string;

    constructor(
        defaultModel: string = "claude-sonnet-4-6",
        dbPath: string="./usage.db"

        

    ){
        this.ledger = new UsageLedger(dbPath)
        this.defaultModel = defaultModel
        this.client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});
    }

   async complete(
    messages: Anthropic.MessageParam[],
    options:{
        system?: string;
        model?: string;
        maxTokens?:number;
        cacheSystem?:boolean;
        thinking?: boolean;
        thinkingBudget?: number
    }={}
   ) : Promise<Anthropic.Message>{

    const model = options.model ?? this.defaultModel

    const params : Anthropic.MessageCreateParamsNonStreaming ={
        model,
        max_tokens: options.maxTokens ?? 1024,
        messages
    }

    if (options.system){
        if(options.cacheSystem){
            params.system =[{
                type: "text",
                text: options.system,
                cache_control:{type: "ephemeral"}

            }]
        }else{
            params.system = options.system
        }
    }

    if(options.thinking){
        params.thinking = {
            type:"enabled",
            budget_tokens:options.thinkingBudget ?? 1024
        }
    }

    const response = await this.client.messages.create(params)

    const usage: UsageRecord={
        inputTokens :response.usage.input_tokens,
        outputTokens :response.usage.output_tokens,
        cacheReadTokens : response.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens : response.usage.cache_creation_input_tokens ?? 0
    }


    this.ledger.record(model, usage)

    return response
   }

   async *stream(messages: Anthropic.MessageParam[], options:{
    system?:string;
    model?:string;
    maxTokens?:number;
    cacheSystem?:boolean;
    thinking?:boolean;
    thinkingBudget?:number
   }={}) : AsyncGenerator<string>{

const model = options.model ?? this.defaultModel

    const params : Anthropic.MessageCreateParams ={
        model,
        max_tokens: options.maxTokens ?? 1024,
        messages
    }

    if (options.system){
        if(options.cacheSystem){
            params.system =[{
                type: "text",
                text: options.system,
                cache_control:{type: "ephemeral"}

            }]
        }else{
            params.system = options.system
        }
    }

    if(options.thinking){
        params.thinking = {
            type:"enabled",
            budget_tokens:options.thinkingBudget ?? 1024
        }
    }

    const stream =  this.client.messages.stream(params)
    for await(const event of stream){
    if (
        event.type == "content_block_delta" && event.delta.type =="text_delta"
    ){
        yield event.delta.text
    }
}

const finalMessage = await stream.finalMessage()

 const usage: UsageRecord={
        inputTokens :finalMessage.usage.input_tokens,
        outputTokens :finalMessage.usage.output_tokens,
        cacheReadTokens : finalMessage.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens : finalMessage.usage.cache_creation_input_tokens ?? 0
    }



this.ledger.record(model, usage);
}

async batchSubmit(requests: any[]): Promise<string> {
    const response = await this.client.beta.messages.batches.create({ requests });
    return response.id;
}
async batchPoll(batchId:string): Promise<object>{
return await this.client.beta.messages.batches.retrieve(batchId)
}

async batchResults(batchId: string): Promise<object[]> {
    const results = [];
    for await (const result of await this.client.beta.messages.batches.results(batchId)) {
        results.push(result);
    }
    return results;
}
}