import { Tool } from "@langchain/core/tools"; // Classe base para ferramentas
import { z } from "zod"; // Para definir o schema da tool (opcional mas bom)
import { spawn, ChildProcess } from "child_process";
import path from "path";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolRequest } from "@modelcontextprotocol/sdk/types.js";

// --- INÍCIO DO CÓDIGO DO McpClientManager (simplificado e integrado aqui por agora) ---
// Idealmente, isto estaria num ficheiro separado, e.g., 'mcp-client.ts'
export class MoodleMcpClient {
  private client: McpClient | null = null;
  private mcpServerProcess: ChildProcess | null = null;
  private readonly mcpServerScriptPath: string;

  constructor(absolutePath: string) {
    // Constrói o caminho absoluto para o script do mcp_server.js
    // Assume que este script do agente está na raiz do teu novo projeto de agente,
    // e o school-moodle-mcp é uma pasta irmã ou num caminho conhecido.
    // AJUSTA ESTE CAMINHO CONFORME A TUA ESTRUTURA!

    this.mcpServerScriptPath = path.resolve(absolutePath);
    console.log(
      `[MyMoodleMcpClient] MCP Server script path: ${this.mcpServerScriptPath}`
    );
  }

  private async startAndConnect(): Promise<McpClient> {
    if (this.client) {
      return this.client;
    }

    console.log("[MyMoodleMcpClient] Spawning MCP Server process...");
    // Assume que o teu mcp_server.js compilado está em 'dist/src/mcp_server.js'
    // dentro da pasta do projeto school-moodle-mcp
    this.mcpServerProcess = spawn("node", [this.mcpServerScriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.mcpServerProcess.stderr?.on("data", (data) => {
      console.error(`[MCP Server STDERR] ${data.toString().trim()}`);
    });
    this.mcpServerProcess.on("exit", (code) => {
      console.warn(
        `[MyMoodleMcpClient] MCP Server process exited with code ${code}`
      );
      this.client = null;
    });
    this.mcpServerProcess.on("error", (err) => {
      console.error(
        "[MyMoodleMcpClient] Failed to start MCP Server process:",
        err
      );
      this.client = null;
      throw err;
    });

    if (!this.mcpServerProcess.stdin || !this.mcpServerProcess.stdout) {
      throw new Error(
        "[MyMoodleMcpClient] Failed to get stdin/stdout for MCP Server process"
      );
    }

    const transport = new StdioClientTransport({
      command: "node",
      args: [this.mcpServerScriptPath],
    });

    this.client = new McpClient({ name: "MyClient", version: "1.0.0" });

    console.log("[MyMoodleMcpClient] Connecting client to transport...");
    await this.client.connect(transport);
    console.log("[MyMoodleMcpClient] MCP Client connected.");
    return this.client;
  }

  public async callMcpTool(toolName: string, input: any): Promise<string> {
    const mcpClient = await this.startAndConnect();
    const requestParams: CallToolRequest["params"] = {
      name: toolName,
      input: input,
    };

    console.log(
      `[MyMoodleMcpClient] Calling MCP tool: ${toolName} with input:`,
      input
    );
    const response = (await mcpClient.callTool(requestParams)) as {
      content?: Array<{ type: string; text: string }>;
    };
    console.log(
      `[MyMoodleMcpClient] Received response from MCP tool ${toolName}:`,
      response
    );

    if (
      response.content &&
      response.content[0] &&
      response.content[0].type === "text"
    ) {
      return response.content[0].text; // Retorna a string JSON que o MCP Server envia
    }
    throw new Error(
      `[MyMoodleMcpClient] Unexpected response format from MCP tool ${toolName}`
    );
  }

  public shutdown() {
    if (this.client) {
      this.client = null;
    }
    if (this.mcpServerProcess) {
      console.log("[MyMoodleMcpClient] Killing MCP Server process...");
      this.mcpServerProcess.kill();
      this.mcpServerProcess = null;
    }
    console.log("[MyMoodleMcpClient] Shutdown complete.");
  }
}
// --- FIM DO CÓDIGO DO MyMoodleMcpClient ---

// --- INÍCIO DA DEFINIÇÃO DA TOOL PERSONALIZADA ---
export class GetMoodleCoursesTool extends Tool {
  name = "get_courses"; // Corresponde ao nome no MCP Server
  description =
    "Retrieves a list of Moodle courses. Optionally filters by course name."; // Para o LLM

  // Schema Zod para que o LangChain (e o LLM se for OpenAI Functions) saiba os parâmetros
  schema = z
    .object({
      input: z.string().optional().describe("Text to filter course names by."),
    })
    .transform((val) => val.input ?? undefined); // always returns string | undefined
  //.transform((val) => val.input);
  // O LLM vai tentar passar 'course_name_filter'
  // A transformação para 'input' pode confundir.
  // O `args` em _call já será o objeto { course_name_filter?: string }

  private moodleClient: MoodleMcpClient;

  constructor(moodleClient: MoodleMcpClient) {
    super(); // Necessário para a classe Tool
    this.moodleClient = moodleClient;
    console.log(`[GetMoodleCoursesTool] Initialized with name: ${this.name}`);
  }

  protected async _call(args: string | undefined): Promise<string> {
    // args is now string | undefined
    const mcpServerInput: { course_name_filter?: string } = {};
    if (typeof args === "string" && args.trim() !== "") {
      mcpServerInput.course_name_filter = args;
    }

    try {
      const resultString = await this.moodleClient.callMcpTool(
        this.name,
        mcpServerInput
      );
      return resultString;
    } catch (error: any) {
      return `Error in tool ${this.name}: ${
        error.message || JSON.stringify(error)
      }`;
    }
  }
}
