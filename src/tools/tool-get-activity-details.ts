import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { MoodleMcpClient } from "../../lib/moodle-mcp-client.js";

// moodle_token is removed from schema as it's handled by MoodleMcpClient
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
      "O ID do curso onde a atividade está localizada. Necessário se activity_id não for fornecido e não estiver no contexto."
    ),
  activity_name: z
    .string()
    .optional()
    .describe(
      "O nome (ou parte do nome) da atividade. Necessário se activity_id não for fornecido."
    ),
});

type GetActivityDetailsToolInput = z.infer<typeof getActivityDetailsToolSchema>;

export class GetActivityDetailsTool extends StructuredTool<
  typeof getActivityDetailsToolSchema // Correctly typed now
> {
  name = "get_activity_details";
  description =
    "Recupera os detalhes de uma atividade específica do Moodle. " +
    "Pode identificar a atividade por 'activity_id' OU por 'course_id' (do argumento ou do contexto) juntamente com 'activity_name'.";
  schema = getActivityDetailsToolSchema;
  moodleClient: MoodleMcpClient; // Explicitly typed

  constructor(moodleClient: MoodleMcpClient) {
    super();
    this.moodleClient = moodleClient;
  }

  async _call(
    args: GetActivityDetailsToolInput,
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
      // If activity_id is provided, course_id might not be strictly necessary for some MCP implementations,
      // but it's good to pass if available, for context or if MCP requires it.
      if (determinedCourseId !== undefined) {
        mcpServerInput.course_id = determinedCourseId;
      }
    } else if (args.activity_name !== undefined) {
      if (determinedCourseId !== undefined) {
        mcpServerInput.course_id = determinedCourseId;
        mcpServerInput.activity_name = args.activity_name;
        console.log(
          `[GetActivityDetailsTool] Usando course_id (${determinedCourseId}) e activity_name: ${args.activity_name}`
        );
      } else {
        return "Erro: Para usar 'activity_name' em get_activity_details, um 'course_id' deve ser fornecido (via argumento ou contexto).";
      }
    } else {
      return "Erro: Para usar get_activity_details, forneça 'activity_id', OU ('activity_name' e um 'course_id' implícito/explícito).";
    }

    console.log(
      `[GetActivityDetailsTool] Calling MCP tool '${
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
      console.error(`[GetActivityDetailsTool] Error in tool ${this.name}:`, error);
      return `Erro na ferramenta ${this.name}: ${errorMessage}`;
    }
  }
}
