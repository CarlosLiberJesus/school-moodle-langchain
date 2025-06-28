import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { MoodleMcpClient } from "../lib/moodle-mcp-client.js";
import { GetMoodleCoursesTool } from "./tools/tool-get-courses.js";
import readline from "readline";
import { setupFileLogger } from "../lib/logger.js";
import { GetMoodleCourseContentsTool } from "./tools/tool-course-details.js";
import { FetchActivityContentTool } from "./tools/tool-get-activity-content.js";
import { GetActivityDetailsTool } from "./tools/tool-get-activity-details.js";
import { GetPageModuleContentTool } from "./tools/tool-get-page-module.js";
import { GetResourceFileContentTool } from "./tools/tool-get-resource-file.js";
import { GetCourseActivitiesTool } from "./tools/tool-get-course-activities.js";
import { DateTimeHelperTool } from "./tools/tool-datetime-helper.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");
const envPath = path.join(projectRoot, ".env");
dotenv.config({ path: envPath });

export const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
export const GOOGLE_MODEL = process.env.GOOGLE_MODEL ?? "";

if (!GOOGLE_API_KEY || !GOOGLE_MODEL) {
  console.error(`Config: GOOGLE_API_KEY or GOOGLE_MODEL not found`);
  process.exit(1);
}

export const MOODLE_MCP_SERVER = process.env.MOODLE_MCP_SERVER ?? "";
if (!MOODLE_MCP_SERVER) {
  console.error(`Config: MOODLE_MCP_SERVER not found`); // Corrected error message
  process.exit(1);
}

const currentFileDir = path.dirname(fileURLToPath(import.meta.url));
const projectRootLogsDir = path.resolve(currentFileDir, "..", "..", "logs");

setupFileLogger(projectRootLogsDir, {
  logLevel:
    (process.env.LOG_LEVEL as "debug" | "info" | "warn" | "error") || "debug",
});

// Store instances globally within the module
let moodleClientInstance: MoodleMcpClient | undefined;
let agentExecutorInstance: AgentExecutor | undefined;
let currentToken: string | undefined; // To track the token used for initialization

async function initializeAgent(moodleToken: string) {
  // If agent is already initialized with the same token, return the existing instance
  if (agentExecutorInstance && currentToken === moodleToken) {
    console.log("Agente LangChain já inicializado com o token atual.");
    return agentExecutorInstance;
  }

  if (!moodleToken) {
    console.error("Erro: Tentativa de inicializar o agente sem um Moodle token.");
    throw new Error("Moodle token é necessário para inicializar o agente.");
  }

  currentToken = moodleToken; // Store the token used for this initialization

  console.log(`Inicializando Agente LangChain com novo token.`);

  const model = new ChatGoogleGenerativeAI({
    model: GOOGLE_MODEL,
    temperature: 0.4,
    apiKey: GOOGLE_API_KEY,
  });

  const PREFIX = `Você é um assistente especializado no Moodle, desenhado para ajudar os utilizadores a interagir com a plataforma.
O seu objetivo principal é utilizar as ferramentas disponíveis para responder de forma precisa e eficiente às perguntas.

Instruções Essenciais:
1.  **Análise da Pergunta:** Compreenda a intenção do utilizador.
2.  **Seleção da Ferramenta:** Escolha a ferramenta mais adequada para a tarefa.
3.  **Invocação da Ferramenta:**
    *   Se a ferramenta requer argumentos, forneça-os num objeto JSON válido, conforme o schema da ferramenta.
    *   Se a ferramenta pode ser chamada sem argumentos específicos (ex: para obter todos os itens), e o utilizador não especificou um filtro, chame a ferramenta com um objeto JSON vazio {{}} como argumento.
    *   **Autenticação (Token Moodle): O token Moodle necessário é gerido centralmente. NÃO o inclua nos argumentos da ferramenta nem o peça ao utilizador.**
    *   NÃO peça confirmação ao utilizador para usar uma ferramenta ou para os seus argumentos, a menos que a pergunta seja ambígua e necessite de clarificação ANTES de selecionar ou invocar uma ferramenta.
4.  **Utilização da Observação:** Após usar uma ferramenta, receberá uma observação.
    *   Se a observação contém a informação necessária, responda diretamente à pergunta do utilizador.
    *   Se precisar de mais informações, pode usar outra ferramenta ou a mesma ferramenta com argumentos diferentes.
5.  **Resposta Final:** Responda ao humano de forma útil e direta. Se não souber a resposta ou a informação não estiver disponível através das ferramentas, admita-o claramente. Não invente respostas.

Não esquecer:
Como agente, tens a liberdade de usar qualquer das ferramentas, sem necessitar da confirmação do utilizador para continuar.

Exemplos de Uso de Ferramentas:
-   **Pergunta do Utilizador:** "Quais são todas as disciplinas disponíveis?"
    **Ação do Agente (Pensamento Interno):** Preciso usar a ferramenta 'get_courses'.
    **Chamada de Ferramenta (Formato JSON para argumentos):** {{}}

-   **Pergunta do Utilizador:** "Quais os conteúdos da disciplina com ID 7?"
    **Ação do Agente (Pensamento Interno):** Preciso usar a ferramenta 'get_course_contents'. O ID da disciplina é 7.
    **Chamada de Ferramenta (Formato JSON para argumentos):** {{"course_id": 7}}

-   **Pergunta do Utilizador:** "Encontra disciplinas sobre 'Inteligência Artificial'."
    **Ação do Agente (Pensamento Interno):** Preciso usar a ferramenta 'get_courses' com um filtro.
    **Chamada de Ferramenta (Formato JSON para argumentos):** {{"course_name_filter": "Inteligência Artificial"}}

Instruções Adicionais para Datas e Tempo:
    - A ferramenta \`datetime_helper\` é essencial para lidar com datas.
    - A ferramenta \`get_course_activities\` retorna uma lista de todas as atividades de um curso.
    - Para saber prazos (\`duedate\`) de atividades, use \`fetch_activity_content\` ou \`get_activity_details\`.

Estilo de Comunicação (Português de Portugal):
  -   Linguagem: Português de Portugal.
  -   Tom: Informal e prestável.
  -   Foco: Utilize apenas informação extraída das ferramentas.
  -   Gramática: Reduza gerúndios.
Exemplos a ter cuidado: base de dados, utilizador, computador, gestor, revisionado.
`;

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", PREFIX],
    new MessagesPlaceholder("chat_history"),
    ["human", "{input}"],
    new MessagesPlaceholder("agent_scratchpad"),
  ]);

  moodleClientInstance = new MoodleMcpClient(MOODLE_MCP_SERVER, moodleToken);

  const tools = [
    new GetMoodleCoursesTool(moodleClientInstance),
    new GetMoodleCourseContentsTool(moodleClientInstance),
    new FetchActivityContentTool(moodleClientInstance),
    new GetActivityDetailsTool(moodleClientInstance),
    new GetPageModuleContentTool(moodleClientInstance),
    new GetResourceFileContentTool(moodleClientInstance),
    new GetCourseActivitiesTool(moodleClientInstance),
    new DateTimeHelperTool(),
  ];

  const agent = await createToolCallingAgent({ llm: model, tools, prompt });
  agentExecutorInstance = new AgentExecutor({ agent, tools, verbose: true });

  console.log("Agente LangChain (re)inicializado com token.");
  return agentExecutorInstance;
}

export async function invokeAgent(params: {
  input: string;
  moodle_user_token: string;
  moodle_course_id?: string; // course_id is optional at this level
  chat_history: Array<HumanMessage | AIMessage>;
}) {
  if (!params.moodle_user_token) {
    console.error("[Agent Service] Erro: Moodle user token não fornecido para invokeAgent.");
    throw new Error("Moodle user token é obrigatório.");
  }

  const executor = await initializeAgent(params.moodle_user_token);

  let augmentedInput = params.input;
  if (params.moodle_course_id) {
    augmentedInput = `Referente à disciplina com ID ${params.moodle_course_id}: ${params.input}`;
    console.log(
      `[Agent Service] Input aumentado para o LLM: "${augmentedInput}"`
    );
  }

  const invokeParams = {
    input: augmentedInput,
    chat_history: params.chat_history,
  };

  console.log(
    `[Agent Service] Invocando agentExecutor com input (final): "${invokeParams.input}" e chat_history.`
  );

  // moodle_user_token and moodle_course_id are no longer passed in configurable for token management here
  // course_id is now part of the augmentedInput if provided
  const result = await executor.invoke(invokeParams, {
    configurable: {
      // Pass other session-specific configurations if any, but not the token for tools
      moodle_course_id: params.moodle_course_id, // Still can be useful for some non-tool related configurations or logging
    }
  });
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cliMoodleToken = process.argv[2];
  const cliCourseId = process.argv[3]; // Optional course ID for context

  if (!cliMoodleToken) {
    console.error(
      "Erro: Token Moodle não fornecido como primeiro argumento da linha de comando."
    );
    console.log("Uso: node build/src/index.js <SEU_MOODLE_TOKEN> [ID_CURSO_OPCIONAL]");
    process.exit(1);
  }

  console.log("Agente LangChain a correr em modo de teste local (readline).");

  initializeAgent(cliMoodleToken).then((executor) => { // Initialize with token from CLI
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const chat_history: Array<HumanMessage | AIMessage> = [];
    rl.setPrompt("User: ");
    rl.prompt();

    rl.on("line", async (input) => {
      try {
        let augmentedInput = input;
        if (cliCourseId) {
          augmentedInput = `Referente à disciplina com ID ${cliCourseId}: ${input}`;
        }
        console.log(`\n[Agent Loop] Invoking agent with input: "${augmentedInput}"`);

        // Ensure agent is initialized with the correct token (should be already, but good for safety if token could change)
        // await initializeAgent(cliMoodleToken); // This might be redundant if token doesn't change per line

        const response = await agentExecutorInstance!.invoke( // agentExecutorInstance should be defined
          {
            input: augmentedInput,
            chat_history: chat_history,
          },
          {
            configurable: { // Pass course_id if available, token is handled by MoodleMcpClient
              moodle_course_id: cliCourseId ? Number(cliCourseId) : undefined,
            }
          }
        );

        console.log("\nAgent Output: ", response.output);

        chat_history.push(new HumanMessage(input)); // Store original input in history
        chat_history.push(new AIMessage(response.output));
      } catch (e: any) {
        console.error("\n[Agent Loop] Error during agent invocation:", e);
        // Avoid adding error to history as AIMessage if it's a system error
      }
      rl.prompt();
    });
  }).catch(error => {
    console.error("Falha ao inicializar o agente para o modo de teste local:", error);
    process.exit(1);
  });
}
