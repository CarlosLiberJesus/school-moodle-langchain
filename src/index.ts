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
    model: "gemini-2.0-flash", // ou 1.5-flash
    temperature: 0.3,
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
    *   NÃO peça confirmação ao utilizador para usar uma ferramenta ou para os seus argumentos, a menos que a pergunta seja ambígua e necessite de clarificação ANTES de selecionar ou invocar uma ferramenta.
4.  **Utilização da Observação:** Após usar uma ferramenta, receberá uma observação.
    *   Se a observação contém a informação necessária, responda diretamente à pergunta do utilizador.
    *   Se precisar de mais informações, pode usar outra ferramenta ou a mesma ferramenta com argumentos diferentes.
5.  **Resposta Final:** Responda ao humano de forma útil e direta. Se não souber a resposta ou a informação não estiver disponível através das ferramentas, admita-o claramente. Não invente respostas.

Exemplos de Uso de Ferramentas:
-   **Pergunta do Utilizador:** "Quais são todas as disciplinas disponíveis?"
    **Ação do Agente (Pensamento Interno):** Preciso usar a ferramenta 'get_courses'. Como o utilizador quer todas as disciplinas, não há filtro.
    **Chamada de Ferramenta (Formato JSON):** 'get_courses' com argumentos {{}}

-   **Pergunta do Utilizador:** "Encontra disciplinas sobre 'Inteligência Artificial'."
    **Ação do Agente (Pensamento Interno):** Preciso usar a ferramenta 'get_courses' com um filtro.
    **Chamada de Ferramenta (Formato JSON):** 'get_courses' com argumentos '{{""course_name_filter"": ""Inteligência Artificial""}}'

Estilo de Comunicação (Português de Portugal):
-   Linguagem: Português de Portugal.
-   Tom: Informal e prestável, pode usar humor apropriado para estudantes.
-   Foco: Utilize apenas informação extraída das ferramentas. Promova o pensamento crítico e socrático quando apropriado, mas priorize a resposta direta à pergunta.
-   Gramática: Reduza gerúndios. Atenção às micro-expressões (ex: utilizar vs. usar, correto vs. certo - a lista fornecida é uma boa referência, mas concentre-se nos mais comuns e deixe o modelo lidar com o resto naturalmente).

[A SUA LISTA DE VOCABULÁRIO PT-PT vs PT-BR PODE SER MANTIDA AQUI OU NUMA SECÇÃO SEPARADA SE O PROMPT FICAR MUITO LONGO]
- base de dados vs banco de dados
- utilizador vs usuário
- computador vs ordenador
- gestor vs gerenciador
- penso higiênico vs absorvente higiênico
- tira-cápsulas vs abridor
- talho vs açougue
- lixívia vs água sanitária
- hospedeira de bordo vs aeromoça
- sebenta vs apostila
- alforreca vs água viva
- alcatrão vs asfalto
- casa de banho vs banheiro
- rebuçado ou caramelo vs bala
- pequeno almoço vs café da manhã
- caminhão vs camião
- palhinha vs canudo
- bilhete de identidade vs carteira de identidade
- carta de condução vs carteira de motorista
- telemóvel vs celular
- invisual vs cego
- pastilha elástica vs chiclete
- descapotável vs conversível
- estomatologista vs dentista
- autoclismo vs descarga
- fita cola vs durex
- adesivo vs esparadrapo
- equipa vs equipe
- perceber vs entender
- passadeira vs faixa de pedestres
- travão vs freio
- gajo/gaja vs rapaz/moça
- malta vs galera (turma, pessoal)
- empregado de mesa vs garçom
- guarda-redes vs goleiro
- frigorifico vs geladeira
- agrafador vs grampeador
- banda desenhada vs história em quadrinhos
- sardanisca vs lagartixa
- fixe vs legal
- lima vs limão
- fato de banho vs maiô
- biberão vs mamadeira
- peúga (peugas) vs meia curta
- miúdo vs menino
- vitrine vs montra
- endereço vs morada
- autocarro vs ônibus
- utente vs paciente
- pera vs cavanhaque
- homem das obras vs pedreiro
- paragem, parada vs ponto de ônibus
- explicador vs professor particular
- fiambre vs presunto
- sanita vs privada
- estrugido (termo usado mais no Norte do país) vs refogado
- rotunda vs rotatória
- sandes vs sanduíche
- centro comercial vs shopping
- sumo vs suco
- gelado vs sorvete
- ecrã vs tela
- fato vs terno
- comboio vs trem
- sanita vs vaso sanitário
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
  const moodleClient = new MoodleMcpClient(
    "E:/MCPs/school-moodle-mcp/build/src/index.js"
  );

  const tools = [
    new GetMoodleCoursesTool(moodleClient),
    // TODO: Criar novas tools que usem moodle_course_id e moodle_user_token
    // new GetCourseContextTool(moodleClient), // Ex: Esta tool usaria moodle_course_id e moodle_user_token
    // new GetUserHistoryTool(moodleClient),  // Ex: Esta tool usaria moodle_user_token e course_id
  ];

  const agent = await createToolCallingAgent({ llm: model, tools, prompt });
  agentExecutorInstance = new AgentExecutor({ agent, tools, verbose: true });

  console.log("Agente LangChain inicializado.");
  return agentExecutorInstance;
}

// Função a ser chamada pela sua WebApp
export async function invokeAgent(params: any) {
  const executor = await initializeAgent(); // Garante que o agente está inicializado

  const invokeParams = {
    input: params.input,
    chat_history: params.chat_history,
    // Se o prompt espera estas variáveis diretamente:
    // moodle_course_id: params.moodle_course_id,
    // moodle_user_token: params.moodle_user_token,
  };

  let augmentedInput = params.input;
  if (params.moodle_course_id) {
    augmentedInput += `\n(Contexto para esta pergunta: ID da disciplina = ${params.moodle_course_id})`;
  }

  console.log(
    `[Agent Service] Invocando agentExecutor com input: "${invokeParams.input}"`
  );
  const result = await executor.invoke(invokeParams, {
    // Configuração para passar dados para as tools (exemplo conceptual, ver doc LangChain)
    // Não adicione o token diretamente ao input visível ao utilizador ou LLM de forma insegura.
    // O token deve ser passado como argumento para a tool que o necessita,
    configurable: {
      moodle_user_token: params.moodle_user_token,
      moodle_course_id: params.moodle_course_id,
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
    rl.question("User: ", async (input) => {
      try {
        console.log(`\n[Agent Loop] Invoking agent with input: "${input}"`);
        const response = await agentExecutorInstance.invoke({
          input: input,
          chat_history: chat_history,
          //agent_scratchpad: [], // O agent_scratchpad é tipicamente gerido internamente pelo AgentExecutor e pelo agente.
          // Normalmente, não se passa agent_scratchpad: [] diretamente para agentExecutor.invoke(). O executor preenche isso conforme necessário.
        });

        console.log("\nAgent Output: ", response.output);

        chat_history.push(new HumanMessage(input));
        chat_history.push(new AIMessage(response.output));
      } catch (e: any) {
        console.error("\n[Agent Loop] Error during agent invocation:", e);
        chat_history.push(
          new AIMessage(`Sorry, I encountered an error: ${e.message}`)
        );
      }
    });
  });
}
