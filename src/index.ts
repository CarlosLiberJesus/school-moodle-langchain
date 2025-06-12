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
export const GOOGLE_MODEL = process.env.GOOGLE_MODEL ?? "";

if (!GOOGLE_API_KEY || !GOOGLE_MODEL) {
  console.error(`Config: GOOGLE_API_KEY or GOOGLE_MODEL not found`);
  process.exit(1);
}

export const MOODLE_MCP_SERVER = process.env.MOODLE_MCP_SERVER ?? "";
if (!MOODLE_MCP_SERVER) {
  console.error(`Config: GOOGLE_API_KEY not found`);
  process.exit(1);
}

const currentFileDir = path.dirname(fileURLToPath(import.meta.url));

const projectRootLogsDir = path.resolve(currentFileDir, "..", "..", "logs");

setupFileLogger(projectRootLogsDir, {
  // Passar o diretório onde os logs devem ser criados
  logLevel:
    (process.env.LOG_LEVEL as "debug" | "info" | "warn" | "error") || "debug", // Usar variável de ambiente se definida
  // logFile: 'mcp_server.log' // Já é o default em logger.ts
});

let agentExecutorInstance: any; // Singleton para o executor

async function initializeAgent() {
  if (agentExecutorInstance) {
    return agentExecutorInstance;
  }

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
    *   **Autenticação (Token Moodle): As ferramentas que acedem a dados específicos do Moodle usarão automaticamente a autenticação (token) fornecida para esta sessão. Você NÃO precisa de pedir o token ao utilizador nem de o incluir nos argumentos da ferramenta, a menos que o schema da ferramenta o peça explicitamente (o que é raro).**
    *   NÃO peça confirmação ao utilizador para usar uma ferramenta ou para os seus argumentos (exceto o token, como explicado acima), a menos que a pergunta seja ambígua e necessite de clarificação ANTES de selecionar ou invocar uma ferramenta.
4.  **Utilização da Observação:** Após usar uma ferramenta, receberá uma observação.
    *   Se a observação contém a informação necessária, responda diretamente à pergunta do utilizador.
    *   Se precisar de mais informações, pode usar outra ferramenta ou a mesma ferramenta com argumentos diferentes.
5.  **Resposta Final:** Responda ao humano de forma útil e direta. Se não souber a resposta ou a informação não estiver disponível através das ferramentas, admita-o claramente. Não invente respostas.

Não esquecer:
O token de autenticação do Moodle necessário para as ferramentas é gerido automaticamente pelo sistema e injetado conforme necessário nas configurações da ferramenta. Não mencione o token nas suas respostas nem o solicite ao utilizador. Concentre-se em usar as ferramentas para obter a informação pedida.
Como agente, tens a liberdade de usar qualquer das ferramentas, sem necessitar da confirmação do utilizador para continuar.

Exemplos de Uso de Ferramentas:
-   **Pergunta do Utilizador:** "Quais são todas as disciplinas disponíveis?"
    **Ação do Agente (Pensamento Interno):** Preciso usar a ferramenta 'get_courses'. Como o utilizador quer todas as disciplinas, não há filtro. O token será usado automaticamente pela ferramenta se necessário.
    **Chamada de Ferramenta (Formato JSON para argumentos):** {{}} // Para 'get_courses'

-   **Pergunta do Utilizador:** "Quais os conteúdos da disciplina com ID 7?"
    **Ação do Agente (Pensamento Interno):** Preciso usar a ferramenta 'get_course_contents'. O ID da disciplina é 7. O token será usado automaticamente.
    **Chamada de Ferramenta (Formato JSON para argumentos):** {{"course_id": 7}} // Para 'get_course_contents'

-   **Pergunta do Utilizador:** "Encontra disciplinas sobre 'Inteligência Artificial'."
    **Ação do Agente (Pensamento Interno):** Preciso usar a ferramenta 'get_courses' com um filtro. O token será usado automaticamente pela ferramenta se necessário.
    **Chamada de Ferramenta (Formato JSON para argumentos):** {{"course_name_filter": "Inteligência Artificial"}}

Estilo de Comunicação (Português de Portugal):
-   Linguagem: Português de Portugal.
-   Tom: Informal e prestável, pode usar humor apropriado para estudantes.
-   Foco: Utilize apenas informação extraída das ferramentas. Promova o pensamento crítico e socrático quando apropriado, mas priorize a resposta direta à pergunta.
-   Gramática: Reduza gerúndios. Atenção às micro-expressões (ex: utilizar vs. usar, correto vs. certo - a lista fornecida é uma boa referência, mas concentre-se nos mais comuns e deixe o modelo lidar com o resto naturalmente).
Exemplos a ter cuidado:
- base de dados vs banco de dados
- utilizador vs usuário
- computador vs ordenador
- gestor vs gerenciador
- revisionado vs revisado
`;

  const prompt = ChatPromptTemplate.fromMessages([
    ["system", PREFIX],
    new MessagesPlaceholder("chat_history"),
    ["human", "{input}"], // A pergunta do utilizador
    // Adicionar placeholder para moodle_course_id e moodle_user_token se o prompt os usar diretamente
    // Ex: ["system", "Contexto adicional: Curso ID {moodle_course_id}, Token Utilizador: {moodle_user_token}"],
    // OU, melhor, passar estes valores para as tools quando são chamadas.
    new MessagesPlaceholder("agent_scratchpad"),
  ]);

  // O cliente MCP pode precisar ser instanciado aqui ou passado para as tools
  const moodleClient = new MoodleMcpClient(MOODLE_MCP_SERVER);

  const tools = [
    new GetMoodleCoursesTool(moodleClient),
    new GetMoodleCourseContentsTool(moodleClient),
    new FetchActivityContentTool(moodleClient),
    new GetActivityDetailsTool(moodleClient),
    new GetPageModuleContentTool(moodleClient),
    new GetResourceFileContentTool(moodleClient),
    // TODO: Continuar a adicionar ideias
  ];

  const agent = await createToolCallingAgent({ llm: model, tools, prompt });
  agentExecutorInstance = new AgentExecutor({ agent, tools, verbose: true });

  console.log("Agente LangChain inicializado.");
  return agentExecutorInstance;
}

// Função a ser chamada pela sua WebApp
export async function invokeAgent(params: any) {
  const executor = await initializeAgent(); // Garante que o agente está inicializado

  let augmentedInput = params.input;
  if (params.moodle_course_id) {
    // Pode ser mais subtil ou direto, dependendo do que funciona melhor
    augmentedInput = `Referente à disciplina com ID ${params.moodle_course_id}: ${params.input}`;
    // Ou:
    // augmentedInput = `${params.input}\n(Nota: Esta pergunta é sobre a disciplina com ID ${params.moodle_course_id})`;
    console.log(
      `[Agent Service] Input aumentado para o LLM: "${augmentedInput}"`
    );
  }

  const invokeParams = {
    input: augmentedInput,
    chat_history: params.chat_history,
    // Se o prompt espera estas variáveis diretamente:
    // moodle_course_id: params.moodle_course_id,
    // moodle_user_token: params.moodle_user_token,
  };

  console.log(
    `[Agent Service] Invocando agentExecutor com input (final): "${invokeParams.input}" e chat_history.`
  );
  console.log(
    `[Agent Service] Passando para configurable: moodle_user_token=${params.moodle_user_token}, moodle_course_id=${params.moodle_course_id}`
  );

  const result = await executor.invoke(invokeParams, {
    configurable: {
      moodle_user_token: params.moodle_user_token,
      moodle_course_id: params.moodle_course_id, // Ainda útil para as tools confirmarem ou usarem diretamente
    },
  });
  return result;
}

// Se este ficheiro for corrido diretamente (node build/src/agent/index.js), pode iniciar o readline para testes locais
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Verifica se é o módulo principal
  console.log("Agente LangChain a correr em modo de teste local (readline).");
  initializeAgent().then(() => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const chat_history: Array<HumanMessage | AIMessage> = [];
    rl.setPrompt("User: ");
    rl.prompt();

    rl.on("line", async (input) => {
      try {
        console.log(`\n[Agent Loop] Invoking agent with input: "${input}"`);
        const response = await agentExecutorInstance.invoke(
          {
            input: input,
            chat_history: chat_history,
          },
          {
            configurable: {
              moodle_user_token: process.argv[2],
              moodle_course_id: Number(process.argv[3]),
            },
          }
        );

        console.log("\nAgent Output: ", response.output);

        chat_history.push(new HumanMessage(input));
        chat_history.push(new AIMessage(response.output));
      } catch (e: any) {
        console.error("\n[Agent Loop] Error during agent invocation:", e);
        chat_history.push(
          new AIMessage(`Sorry, I encountered an error: ${e.message}`)
        );
      }
      rl.prompt();
    });
  });
}
