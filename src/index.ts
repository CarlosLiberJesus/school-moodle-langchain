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
import { GetMoodleCourseContentsTool } from "./tools/tool-course-details.js";
import { FetchActivityContentTool } from "./tools/tool-get-activity-content.js";
import { GetActivityDetailsTool } from "./tools/tool-get-activity-details.js";
import { GetPageModuleContentTool } from "./tools/tool-get-page-module.js";
import { GetResourceFileContentTool } from "./tools/tool-get-resource-file.js";
import { GetCourseActivitiesTool } from "./tools/tool-get-course-activities.js";
import { DateTimeHelperTool } from "./tools/tool-datetime-helper.js";
import readline from "readline";
import { setupFileLogger } from "../lib/logger.js";
import {
  CustomAgentMonitor,
  PerformanceMonitor,
} from "../lib/agent-monitor.js";

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
  console.error(`Config: MOODLE_MCP_SERVER not found`);
  process.exit(1);
}

const currentFileDir = path.dirname(fileURLToPath(import.meta.url));
const projectRootLogsDir = path.resolve(currentFileDir, "..", "..", "logs");

setupFileLogger(projectRootLogsDir, {
  logLevel:
    (process.env.LOG_LEVEL as "debug" | "info" | "warn" | "error") || "debug",
});

// CLASSE AGENTMANAGER - SUBSTITUI O SINGLETON ANTERIOR
class AgentManager {
  private static instance: AgentManager;
  private agentExecutor: any = null;
  private monitor: CustomAgentMonitor;
  private performanceMonitor: PerformanceMonitor;

  private constructor() {
    // Configurar nível de log via variável de ambiente
    const logLevel =
      (process.env.AGENT_LOG_LEVEL as "minimal" | "detailed" | "debug") ||
      "minimal";
    this.monitor = new CustomAgentMonitor(logLevel);
    this.performanceMonitor = PerformanceMonitor.getInstance();

    console.log(`🔍 Monitor iniciado no nível: ${logLevel}`);
  }

  static getInstance(): AgentManager {
    if (!AgentManager.instance) {
      AgentManager.instance = new AgentManager();
    }
    return AgentManager.instance;
  }

  async initialize() {
    if (this.agentExecutor) {
      return this.agentExecutor;
    }

    console.log("🚀 Inicializando AgentManager...");

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

-   **Pergunta do Utilizador:** "Quais tarefas têm prazo para a próxima semana na disciplina com ID 6?"
    **Ação do Agente (Pensamento Interno):**
    1. Preciso saber o intervalo de datas para "próxima semana". Posso obter a data atual com \`datetime_helper\` (\`getCurrentDateTimeISO\`), depois calcular uma data na próxima semana e usar essa data com \`datetime_helper\` e \`getStartAndEndOfWeekISO\`.
    2. Preciso obter todas as atividades da disciplina 6 usando \`get_course_activities\`.
    3. Para cada atividade da lista que pareça ser uma tarefa ou algo com prazo, preciso obter os seus detalhes completos para encontrar o \`duedate\`. Usarei \`fetch_activity_content\` ou \`get_activity_details\` com o ID da atividade. (Lembre-se: \`get_course_activities\` pode não listar \`duedate\` diretamente).
    4. Vou converter os \`duedate\` (que são timestamps Unix) para datas ISO usando \`datetime_helper\` com \`convertTimestampToDateTimeISO\`.
    5. Filtrarei as atividades cujo \`duedate\` convertido esteja dentro do intervalo da "próxima semana".
    6. Responderei com as atividades encontradas.
    **Chamadas de Ferramenta (Exemplo de Fluxo):**
    (datetime_helper para datas) -> (get_course_activities) -> (looping com fetch_activity_content/get_activity_details para cada atividade relevante) -> (datetime_helper para conversão de duedate e comparação)

Instruções Adicionais para Datas e Tempo:
    - A ferramenta \`datetime_helper\` é essencial para lidar com datas. Use-a para:
    - Obter a data/hora atual em formato ISO (\`getCurrentDateTimeISO\`).
    - Converter timestamps Unix (segundos) para formato ISO (\`convertTimestampToDateTimeISO\`). O 'value' deve ser o timestamp numérico.
    - Obter o início (Segunda) e fim (Domingo) de uma semana (\`getStartAndEndOfWeekISO\`). Pode fornecer uma data ISO em 'value' para especificar a semana, ou omitir 'value' para a semana atual.
    - Obter o início e fim de um mês (\`getStartAndEndOfMonthISO\`). Pode fornecer uma data ISO em 'value' para especificar o mês, ou omitir 'value' para o mês atual.
    - A ferramenta \`get_course_activities\` retorna uma lista de todas as atividades de um curso (dado \`course_id\`), incluindo um campo \`timemodified\` (timestamp Unix da última modificação). Use esta ferramenta para perguntas sobre o que foi alterado ou adicionado recentemente num curso. Para comparar o \`timemodified\` com um período (ex: "esta semana"), use \`datetime_helper\` para obter o período e converter o \`timemodified\`.
    - Para saber prazos (\`duedate\`) de atividades, primeiro identifique atividades potenciais com \`get_course_activities\` ou \`get_course_contents\`. Depois, use \`fetch_activity_content\` ou \`get_activity_details\` para a atividade específica, pois estas ferramentas fornecem detalhes mais completos, incluindo \`duedate\` (timestamp Unix). Converta o \`duedate\` usando \`datetime_helper\` para comparações.

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
      ["human", "{input}"],
      new MessagesPlaceholder("agent_scratchpad"),
    ]);

    const moodleClient = new MoodleMcpClient(MOODLE_MCP_SERVER);

    const tools = [
      new GetMoodleCoursesTool(moodleClient),
      new GetMoodleCourseContentsTool(moodleClient),
      new FetchActivityContentTool(moodleClient),
      new GetActivityDetailsTool(moodleClient),
      new GetPageModuleContentTool(moodleClient),
      new GetResourceFileContentTool(moodleClient),
      new GetCourseActivitiesTool(moodleClient),
      new DateTimeHelperTool(),
    ];

    const agent = await createToolCallingAgent({ llm: model, tools, prompt });

    this.agentExecutor = new AgentExecutor({
      agent,
      tools,
      verbose: false, // DESATIVAR verbose original
      callbacks: [this.monitor], // USAR monitor customizado
    });

    console.log("🤖 Agente LangChain inicializado com monitorização avançada.");
    return this.agentExecutor;
  }

  async invoke(params: any) {
    const executor = await this.initialize();

    let augmentedInput = params.input;
    if (params.moodle_course_id) {
      augmentedInput = `Referente à disciplina com ID ${params.moodle_course_id}: ${params.input}`;
      console.log(
        `[Agent Service] Input aumentado: "${augmentedInput.substring(
          0,
          100
        )}..."`
      );
    }

    const invokeParams = {
      input: augmentedInput,
      chat_history: params.chat_history,
    };

    console.log(`[Agent Service] Invocando agentExecutor...`);
    console.log(
      `[Agent Service] Token: ${
        params.moodle_user_token ? "presente" : "ausente"
      }, Course ID: ${params.moodle_course_id || "N/A"}`
    );

    const startTime = Date.now();

    try {
      const result = await executor.invoke(invokeParams, {
        configurable: {
          moodle_user_token: params.moodle_user_token,
          moodle_course_id: params.moodle_course_id,
        },
        callbacks: [this.monitor], // Importante: monitor também aqui
      });

      // Registar métricas de performance
      const executionTime = Date.now() - startTime;
      this.performanceMonitor.recordMetric("execution_time", executionTime);
      this.performanceMonitor.recordMetric(
        "tools_used",
        this.monitor.getStats().toolCalls.length
      );

      // Log estruturado opcional
      if (process.env.EXPORT_AGENT_LOGS === "true") {
        const logs = this.monitor.exportLogs();
        console.log("📋 AGENT_EXECUTION_LOG:", JSON.stringify(logs, null, 2));
      }

      return result;
    } catch (error: any) {
      console.error("💥 [AgentManager] Erro durante execução:", error.message);

      // Registar erro nas métricas
      this.performanceMonitor.recordMetric("errors", 1);

      throw error;
    }
  }

  // Métodos utilitários
  getMonitor() {
    return this.monitor;
  }

  getPerformanceMonitor() {
    return this.performanceMonitor;
  }

  getStats() {
    return {
      execution: this.monitor.getStats(),
      performance: this.performanceMonitor.getMetricSummary(),
    };
  }

  generateDashboard() {
    const summary = this.performanceMonitor.getMetricSummary();

    console.log("\n📈 DASHBOARD DO AGENTE MOODLE");
    console.log("============================");

    if (Object.keys(summary).length === 0) {
      console.log("📊 Ainda não há dados suficientes para mostrar métricas.");
      console.log("============================\n");
      return;
    }

    Object.entries(summary).forEach(([metric, data]: [string, any]) => {
      const displayName = metric.replace("_", " ").toUpperCase();
      console.log(`\n${displayName}:`);
      console.log(`  📊 Execuções: ${data.count}`);

      if (metric.includes("time")) {
        console.log(`  ⏱️  Média: ${Math.round(data.average)}ms`);
        console.log(`  ⚡ Min/Max: ${data.min}ms / ${data.max}ms`);
      } else {
        console.log(`  📈 Média: ${data.average.toFixed(2)}`);
        console.log(`  📉 Min/Max: ${data.min} / ${data.max}`);
      }

      if (data.recent && data.recent.length > 0) {
        const recentStr = metric.includes("time")
          ? data.recent.map((v: number) => `${v}ms`).join(", ")
          : data.recent.join(", ");
        console.log(`  📋 Recentes: [${recentStr}]`);
      }
    });

    console.log("\n============================\n");
  }

  resetMetrics() {
    this.performanceMonitor.reset();
    console.log("🔄 Métricas reiniciadas");
  }
}

// FUNÇÕES EXPORTADAS - COMPATIBILIDADE COM O TEU CÓDIGO ATUAL
export async function invokeAgent(params: any) {
  const agentManager = AgentManager.getInstance();
  return await agentManager.invoke(params);
}

export function getAgentMetrics() {
  const agentManager = AgentManager.getInstance();
  return agentManager.getStats();
}

export function showAgentDashboard() {
  const agentManager = AgentManager.getInstance();
  agentManager.generateDashboard();
}

export function resetAgentMetrics() {
  const agentManager = AgentManager.getInstance();
  agentManager.resetMetrics();
}

// MODO DE TESTE LOCAL - ADAPTADO PARA USAR AGENTMANAGER
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log("🧪 Agente em modo de teste com monitorização avançada");

  AgentManager.getInstance()
    .initialize()
    .then(() => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const chat_history: Array<HumanMessage | AIMessage> = [];
      let executionCount = 0;

      rl.setPrompt("User: ");
      rl.prompt();

      rl.on("line", async (input) => {
        if (input.toLowerCase() === "dashboard") {
          showAgentDashboard();
          rl.prompt();
          return;
        }

        if (input.toLowerCase() === "reset") {
          resetAgentMetrics();
          rl.prompt();
          return;
        }

        if (input.toLowerCase() === "stats") {
          console.log(JSON.stringify(getAgentMetrics(), null, 2));
          rl.prompt();
          return;
        }

        try {
          console.log(`\n[Agent Loop] Processando: "${input}"`);

          const response = await invokeAgent({
            input: input,
            chat_history: chat_history,
            moodle_user_token: process.argv[2],
            moodle_course_id: process.argv[3]
              ? Number(process.argv[3])
              : undefined,
          });

          console.log("\n🤖 Agent Output:", response.output);

          chat_history.push(new HumanMessage(input));
          chat_history.push(new AIMessage(response.output));

          executionCount++;

          // Mostrar dashboard a cada 5 execuções
          if (executionCount % 5 === 0) {
            console.log(`\n📊 Dashboard após ${executionCount} execuções:`);
            showAgentDashboard();
          }
        } catch (e: any) {
          console.error("\n💥 [Agent Loop] Erro:", e.message);
          chat_history.push(
            new AIMessage(`Desculpa, ocorreu um erro: ${e.message}`)
          );
        }

        rl.prompt();
      });

      console.log("\n📝 Comandos especiais:");
      console.log("  - 'dashboard' - Mostrar métricas");
      console.log("  - 'reset' - Reiniciar métricas");
      console.log("  - 'stats' - Ver estatísticas detalhadas");
      console.log("  - Ctrl+C - Sair\n");
    });
}
