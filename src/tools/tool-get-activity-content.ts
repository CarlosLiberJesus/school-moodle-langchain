import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { MoodleMcpClient } from "../../lib/moodle-mcp-client.js";

// Schema para os argumentos que o LLM vai preencher
// moodle_token is removed from schema as it's handled by MoodleMcpClient
// course_id removido do schema. Será obtido do config.
const fetchActivityContentToolSchema = z.object({
  activity_id: z
    .number()
    .optional()
    .describe(
      "O ID da atividade (Course Module ID - cmid) para obter o conteúdo. Use isto OU activity_name (o ID do curso será obtido do contexto)."
    ),
  // course_id foi removido. O sistema gere o ID do curso.
  activity_name: z
    .string()
    .optional()
    .describe(
      "O nome (ou parte do nome) da atividade. Use isto se não tiver o activity_id. O ID do curso será obtido do contexto."
    ),
});

// Tipagem para os argumentos (inferida do schema)
type FetchActivityContentToolInput = z.infer<
  typeof fetchActivityContentToolSchema
>;

export class FetchActivityContentTool extends StructuredTool<
  typeof fetchActivityContentToolSchema
> {
  name = "fetch_activity_content";
  description =
    "Obtém o conteúdo detalhado de uma atividade específica do Moodle (descrição, texto, ficheiros associados, etc). " +
    "Pode identificar a atividade por 'activity_id' OU por 'activity_name'. O ID do curso é gerido automaticamente pelo sistema.";
  schema = fetchActivityContentToolSchema;
  moodleClient: MoodleMcpClient;

  constructor(moodleClient: MoodleMcpClient) {
    super();
    this.moodleClient = moodleClient;
  }

  async _call(
    args: FetchActivityContentToolInput,
    config?: Record<string, any>
  ): Promise<string> {
    const course_id_from_config = config?.configurable?.moodle_course_id;

    const mcpServerInput: {
      activity_id?: number;
      course_id?: number;
      activity_name?: string;
    } = {};

    if (args.activity_id !== undefined) {
      mcpServerInput.activity_id = args.activity_id;
      // Mesmo que activity_id seja fornecido, o course_id do contexto pode ser útil para o MCP Server em alguns casos
      // ou para validação. Se não estiver no contexto, a tool pode funcionar sem ele se o MCP server permitir.
      if (typeof course_id_from_config === 'number') {
        mcpServerInput.course_id = course_id_from_config;
      }
    } else if (args.activity_name !== undefined) {
      if (typeof course_id_from_config !== 'number') {
        console.error(
          `[FetchActivityContentTool] Erro: activity_name ('${args.activity_name}') fornecido, mas course_id não está disponível no contexto.`
        );
        return `Erro na ferramenta ${this.name}: Para pesquisar uma atividade por nome, o ID do curso (course_id) deve estar definido no contexto.`;
      }
      mcpServerInput.course_id = course_id_from_config;
      mcpServerInput.activity_name = args.activity_name;
      console.log(
        `[FetchActivityContentTool] Usando course_id (${course_id_from_config}) do contexto e activity_name: ${args.activity_name}`
      );
    } else {
      return `Erro na ferramenta ${this.name}: Forneça 'activity_id' ou 'activity_name'. O ID do curso é gerido pelo sistema.`;
    }

    console.log(
      `[FetchActivityContentTool] Calling MCP tool '${
        this.name
      }' with input: ${JSON.stringify(mcpServerInput)} (token injected by client, course_id from config if applicable)`
    );
    try {
      const resultString = await this.moodleClient.callMcpTool(
        this.name,
        mcpServerInput
      );
      return resultString;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : JSON.stringify(error);
      console.error(`[FetchActivityContentTool] Error in tool ${this.name}:`, error);
      return `Erro na ferramenta ${this.name}: ${errorMessage}`;
    }
  }
}
