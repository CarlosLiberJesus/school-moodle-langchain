import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { MoodleMcpClient } from "../../lib/moodle-mcp-client.js";

const getActivityDetailsToolSchema = z.object({
  activity_id: z
    .number()
    .optional()
    .describe(
      "O ID da atividade (Course Module ID - cmid) para obter os detalhes. Use isto OU course_id e activity_name."
    ),
  course_id: z
    .number()
    .optional()
    .describe(
      "O ID do curso onde a atividade está localizada. Necessário se activity_id não for fornecido."
    ),
  activity_name: z
    .string()
    .optional()
    .describe(
      "O nome (ou parte do nome) da atividade. Necessário se activity_id não for fornecido e course_id for fornecido."
    ),
});

type GetActivityDetailsToolInput = z.infer<typeof getActivityDetailsToolSchema>;

export class GetActivityDetailsTool extends StructuredTool /*<typeof getActivityDetailsToolSchema>*/ {
  name = "get_activity_details";
  description =
    "Recupera os detalhes de uma atividade específica do Moodle. " +
    "Pode identificar a atividade por 'activity_id' OU por 'course_id' juntamente com 'activity_name'.";
  schema = getActivityDetailsToolSchema;
  moodleClient; // : MoodleMcpClient;

  constructor(moodleClient: MoodleMcpClient) {
    super();
    this.moodleClient = moodleClient;
  }

  async _call(
    args: GetActivityDetailsToolInput,
    config: Record<string, any> | undefined
  ) {
    const moodleToken =
      config?.configurable?.moodle_user_token ||
      config?.metadata?.moodle_user_token;
    const courseIdFromConfig =
      config?.configurable?.moodle_course_id ||
      config?.metadata?.moodle_course_id;

    if (!moodleToken) {
      return "Erro: Token do utilizador não fornecido para a ferramenta get_activity_details.";
    }

    const mcpServerInput: {
      moodle_token: string;
      activity_id?: number;
      course_id?: number;
      activity_name?: string;
    } = {
      moodle_token: moodleToken,
      course_id: courseIdFromConfig,
    };

    if (args.activity_id !== undefined) {
      mcpServerInput.activity_id = args.activity_id;
    } else if (
      args.course_id !== undefined &&
      args.activity_name !== undefined
    ) {
      mcpServerInput.course_id = args.course_id;
      mcpServerInput.activity_name = args.activity_name;
    } else if (
      courseIdFromConfig !== undefined &&
      args.activity_name !== undefined
    ) {
      console.log(
        `[GetActivityDetailsTool] Usando course_id (${courseIdFromConfig}) do contexto configurável com activity_name: ${args.activity_name}`
      );
      mcpServerInput.course_id = courseIdFromConfig;
      mcpServerInput.activity_name = args.activity_name;
    } else {
      return "Erro: Para usar get_activity_details, forneça 'activity_id', OU ('course_id' E 'activity_name'). Se o curso já estiver em contexto, apenas 'activity_name' pode ser suficiente.";
    }

    console.log(
      `[GetActivityDetailsTool] Calling MCP tool '${
        this.name
      }' with input: ${JSON.stringify(mcpServerInput)}`
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
      return `Erro na ferramenta ${this.name}: ${errorMessage}`;
    }
  }
}
