import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import {
  StringOutputParser,
  CommaSeparatedListOutputParser,
} from "@langchain/core/output_parsers";
import { StructuredOutputParser } from "langchain/output_parsers";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const envPath = path.join(projectRoot, ".env");

const loadEnvResult = dotenv.config({ path: envPath });

if (loadEnvResult.error) {
  console.error(
    `Config: Error loading .env from ${envPath}: ${loadEnvResult.error.message}`
  );
  process.exit(1);
}

export const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

if (!GOOGLE_API_KEY) {
  console.error(`Config: GOOGLE_API_KEY not found`);
  process.exit(1);
}

// Setting the Model
const model = new ChatGoogleGenerativeAI({
  model: "gemini-2.0-flash",
  temperature: 0.3,
  verbose: false,
  apiKey: GOOGLE_API_KEY,
});

const response = await cleanStringOutput();
//const response = await callStringOuputParser(); // encasula a resposta em array
console.log(response);

async function cleanStringOutput() {
  // Setting the prompt
  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      "És um assintente em educação, que recorre a ferramentas do Moodle para informar a actividade da escola",
    ],
    ["human", "{input}"],
  ]);
  // Resultado da Prompt
  //console.log(await prompt.format({ input: "Que posso fazer hoje?" }));

  // Vai limpar a res
  const parser = new StringOutputParser();

  // Criar a chain
  const chain = prompt.pipe(model).pipe(parser);

  // Call chain
  return await chain.invoke({
    input: "Que posso fazer hoje?",
  });
}
