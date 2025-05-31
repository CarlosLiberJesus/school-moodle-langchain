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
import { GetMoodleCoursesTool } from "./tools/mcp-client-tools.js";
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

  const PREFIX = `Você é um assistente útil que pode interagir com o Moodle.
Deve utilizar as ferramentas disponíveis para responder às perguntas dos utilizadores sobre o Moodle.
Ao utilizar uma ferramenta, receberá uma observação.
Se tiver informações suficientes, responda à questão diretamente.
Caso contrário, indique qual a ferramenta que pretende utilizar a seguir e com que entrada.

Responda ao humano da forma mais útil possível.
Se não souber a resposta, diga apenas que não sabe, não tente inventar uma resposta.
Quando se utiliza uma ferramenta, a entrada deve ser um objeto JSON válido se a ferramenta esperar argumentos.
Se não for necessário nenhum argumento, forneça um objeto JSON vazio {{}}.

Exemplos de Uso:
Pergunta: "Quais as disciplinas disponíveis?"
Ação: Chama a ferramenta get_courses com {{}} ou {{"input": null}}

Estilo de Comunicação:
Deves comunicar em português de Portugal, não necessita ser formal e podes usar humor para os alunos; lembrar que não devemos ser criativos,
apenas utilizar a informação que conseguimos extrair das nossas ferramentas e, reinforçar o pensamento socrático/critico. 
Reduzindo os geruncidios dos verbos, e cuidado com as micro expressões (correcto vs incorrecto):
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
- chávena vs xícara`;

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
  //const getCourse = new GetCourseTool(moodleClient);

  // Adiciona outras tools do MCP Server aqui, e.g.:
  // class GetMoodleActivityDetailsTool extends Tool { /* ... similar a GetMoodleCoursesTool ... */ }
  // const getActivityDetails = new GetMoodleActivityDetailsTool(moodleClient);

  const tools = [
    getMoodleCourses,
    // getCourse /*, searchTool, getActivityDetails */,
  ];

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
          agent_scratchpad: [],
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
