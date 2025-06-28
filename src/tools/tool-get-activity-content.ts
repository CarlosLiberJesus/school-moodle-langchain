import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { MoodleMcpClient } from "../../lib/moodle-mcp-client.js";

// Schema para os argumentos que o LLM vai preencher
// moodle_token is removed from schema as it's handled by MoodleMcpClient
const fetchActivityContentToolSchema = z.object({
  activity_id: z
    .number()
    .optional()
    .describe(
      "O ID da atividade (Course Module ID - cmid) para obter o conteúdo. Use isto OU course_id e activity_name."
    ),
  course_id: z
    .number()
    .optional()
    .describe(
      "O ID do curso onde a atividade está localizada. Necessário se activity_id não for fornecido e não estiver no contexto."
    ),
  activity_name: z
    .string()
    .optional()
    .describe(
      "O nome (ou parte do nome) da atividade. Necessário se activity_id não for fornecido."
    ),
});

// Tipagem para os argumentos (inferida do schema)
type FetchActivityContentToolInput = z.infer<
  typeof fetchActivityContentToolSchema
>;

export class FetchActivityContentTool extends StructuredTool<
  typeof fetchActivityContentToolSchema // Correctly typed
> {
  name = "fetch_activity_content";
  description =
    "Obtém o conteúdo detalhado de uma atividade específica do Moodle (descrição, texto, ficheiros associados, etc). " +
    "Pode identificar a atividade por 'activity_id' OU por 'course_id' (do argumento ou do contexto) juntamente com 'activity_name'.";
  schema = fetchActivityContentToolSchema;
  moodleClient: MoodleMcpClient; // Explicitly typed

  constructor(moodleClient: MoodleMcpClient) {
    super();
    this.moodleClient = moodleClient;
  }

  async _call(
    args: FetchActivityContentToolInput,
    config?: Record<string, any> // config is optional and used for course_id context
  ): Promise<string> {
    // moodle_token is no longer sourced from config. MoodleMcpClient handles it.

    const courseIdFromConfig =
      config?.configurable?.moodle_course_id ||
      config?.metadata?.moodle_course_id;

    // mcpServerInput will not include moodle_token here.
    const mcpServerInput: {
      activity_id?: number;
      course_id?: number;
      activity_name?: string;
    } = {};

    let determinedCourseId = args.course_id ?? courseIdFromConfig;

    if (args.activity_id !== undefined) {
      mcpServerInput.activity_id = args.activity_id;
      if (determinedCourseId !== undefined) {
        mcpServerInput.course_id = determinedCourseId;
      }
    } else if (args.activity_name !== undefined) {
      if (determinedCourseId !== undefined) {
        mcpServerInput.course_id = determinedCourseId;
        mcpServerInput.activity_name = args.activity_name;
        console.log(
          `[FetchActivityContentTool] Usando course_id (${determinedCourseId}) e activity_name: ${args.activity_name}`
        );
      } else {
        return "Erro: Para usar 'activity_name' em fetch_activity_content, um 'course_id' deve ser fornecido (via argumento ou contexto).";
      }
    } else {
      return "Erro: Para usar fetch_activity_content, forneça 'activity_id', OU ('activity_name' e um 'course_id' implícito/explícito).";
    }

    console.log(
      `[FetchActivityContentTool] Calling MCP tool '${
        this.name
      }' with input: ${JSON.stringify(mcpServerInput)} (token will be injected by client)`
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
