import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import * as dotenv from "dotenv";

dotenv.config(); 

async function main() {
  console.log("准备连接 Qwen3...");

  const chatModel = new ChatOpenAI({
    apiKey: process.env.QWEN3_API_KEY,      
    configuration: {
      baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1" 
    },
    modelName: "qwen3-max", 
    temperature: 0.1,      
  });

  const messages = [
    new SystemMessage("你是一个认真严谨的大学教务老师，擅长处理保研加分咨询。"),
    new HumanMessage("你好，我刚刚拿了‘挑战杯’国二，请问你应该怎么帮我？")
  ];

  const response = await chatModel.invoke(messages);

  console.log("\n🤖 Qwen3 回复：");
  console.log(response.content);
}

main().catch(console.error);