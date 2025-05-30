import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import {
  MoodleMcpClient,
  GetMoodleCoursesTool,
} from "../lib/moodle-mcp-client.js";
import readline from "readline";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");
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

async function main() {
  // Instantiate the model
  const model = new ChatGoogleGenerativeAI({
    model: "gemini-2.0-flash",
    //model: "gemini-1.5-flash-latest",
    temperature: 0.3,
    verbose: false,
    apiKey: GOOGLE_API_KEY,
  });

  const PREFIX = `You are a helpful assistant that can interact with Moodle.
You should use the available tools to answer the user's questions about Moodle.
When using a tool, you will be provided with an observation.
If you have enough information, answer the question directly.
Otherwise, indicate which tool you want to use next and with what input.

Respond to the human as helpfully as possible.
If you don't know the answer, just say that you don't know, don't try to make up an answer.
When using a tool, the input should be a valid JSON object if the tool expects arguments.
If no arguments are needed, provide an empty JSON object {{}}.`;

  // Este é um ponto onde a documentação específica de agentes Gemini na LangChain.js é crucial.
  // O createToolCallingAgent é o mais genérico e moderno.
  const prompt = ChatPromptTemplate.fromMessages([
    ["system", PREFIX], // Ou um prompt mais específico para tool calling
    new MessagesPlaceholder("chat_history"),
    ["human", "{input}"],
    new MessagesPlaceholder("agent_scratchpad"), // Para o agente guardar os seus passos intermediários (chamadas a tools e observações)
  ]);

  // Instantiate o nosso cliente MCP
  // AJUSTA O PATH para o teu mcp_server.js compilado/executável
  // Exemplo: se o teu MCP Server está em ../school-moodle-mcp/dist/src/mcp_server.js
  const moodleClient = new MoodleMcpClient(
    "E:/MCPs/school-moodle-mcp/build/src/index.js"
  );

  // Tools
  // const searchTool = new TavilySearchResults(); // Podes manter se quiseres pesquisa web geral
  const getMoodleCourses = new GetMoodleCoursesTool(moodleClient); // Passa o cliente para a tool

  // Adiciona outras tools do MCP Server aqui, e.g.:
  // class GetMoodleActivityDetailsTool extends Tool { /* ... similar a GetMoodleCoursesTool ... */ }
  // const getActivityDetails = new GetMoodleActivityDetailsTool(moodleClient);

  const tools = [getMoodleCourses /*, searchTool, getActivityDetails */];

  // O createToolCallingAgent é uma função mais recente e genérica
  // para construir agentes que usam o "tool calling" dos LLMs.
  const agent = await createToolCallingAgent({
    llm: model, // O teu modelo Gemini
    tools, // A tua lista de LangChain Tools
    prompt,
  });

  // Create the executor
  const agentExecutor = new AgentExecutor({
    agent,
    tools, // Passa as mesmas tools para o executor
    verbose: true, // Adiciona verbose para ver os pensamentos do agente
  });

  // User Input
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const chat_history: Array<HumanMessage | AIMessage> = [];

  function askQuestionLoop() {
    rl.question("User: ", async (input) => {
      if (input.toLowerCase() === "exit") {
        rl.close();
        moodleClient.shutdown(); // Importante para terminar o processo do MCP server
        return;
      }

      try {
        console.log(`\n[Agent Loop] Invoking agent with input: "${input}"`);
        const response = await agentExecutor.invoke({
          input: input,
          chat_history: chat_history,
        });

        console.log("\nAgent Output: ", response.output);

        chat_history.push(new HumanMessage(input));
        chat_history.push(new AIMessage(response.output));
      } catch (e: any) {
        console.error("\n[Agent Loop] Error during agent invocation:", e);
        // Opcional: Adicionar uma mensagem de erro ao histórico
        // chat_history.push(new AIMessage(`Sorry, I encountered an error: ${e.message}`));
      }
      askQuestionLoop();
    });
  }

  console.log("LangChain Moodle Agent started. Type 'exit' to quit.");
  askQuestionLoop();
}

main().catch(console.error);
