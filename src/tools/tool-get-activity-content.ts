import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { MoodleMcpClient } from "../../lib/moodle-mcp-client.js";

// Schema permite course_id opcional - se não fornecido, usa o do MoodleClient
const fetchActivityContentToolSchema = z.object({
  activity_id: z
    .number()
    .optional()
    .describe(
      "O ID da atividade (Course Module ID - cmid) para obter o conteúdo. Use isto OU activity_name."
    ),
  course_id: z
    .number()
    .optional()
    .describe("ID do curso. Se não fornecido, usa o curso atual do contexto."),
  activity_name: z
    .string()
    .optional()
    .describe(
      "O nome (ou parte do nome) da atividade. Use isto se não tiver o activity_id."
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
    "Pode identificar a atividade por 'activity_id' OU por 'activity_name'. Se course_id não for fornecido, usa o curso atual do contexto.";
  schema = fetchActivityContentToolSchema;
  moodleClient: MoodleMcpClient;

  constructor(moodleClient: MoodleMcpClient) {
    super();
    this.moodleClient = moodleClient;
  }

  async _call(args: FetchActivityContentToolInput): Promise<string> {
    const mcpServerInput: {
      activity_id?: number;
      course_id?: number;
      activity_name?: string;
    } = {};

    if (args.activity_id !== undefined) {
      mcpServerInput.activity_id = args.activity_id;
      // Se course_id foi fornecido nos args, usa-o; senão o MoodleClient irá injetar automaticamente
      if (args.course_id) {
        mcpServerInput.course_id = args.course_id;
      }
    } else if (args.activity_name !== undefined) {
      mcpServerInput.activity_name = args.activity_name;
      // Para pesquisar por nome, course_id é normalmente necessário
      if (args.course_id) {
        mcpServerInput.course_id = args.course_id;
      }
      // Se não foi fornecido, o MoodleClient irá injetar automaticamente se disponível
    } else {
      return `Erro na ferramenta ${this.name}: Forneça 'activity_id' ou 'activity_name'.`;
    }

    console.log(
      `[FetchActivityContentTool] Calling MCP tool '${
        this.name
      }' with input: ${JSON.stringify(
        mcpServerInput
      )} (token e course_id serão injetados pelo MoodleClient se necessário)`
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
      console.error(
        `[FetchActivityContentTool] Error in tool ${this.name}:`,
        error
      );
      return `Erro na ferramenta ${this.name}: ${errorMessage}`;
    }
  }
}
