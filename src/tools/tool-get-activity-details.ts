import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { MoodleMcpClient } from "../../lib/moodle-mcp-client.js";

// Schema permite course_id opcional - se não fornecido, usa o do MoodleClient
const getActivityDetailsToolSchema = z.object({
  activity_id: z
    .number()
    .optional()
    .describe(
      "O ID da atividade (Course Module ID - cmid) para obter os detalhes. Use isto OU activity_name."
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

type GetActivityDetailsToolInput = z.infer<typeof getActivityDetailsToolSchema>;

export class GetActivityDetailsTool extends StructuredTool<
  typeof getActivityDetailsToolSchema
> {
  name = "get_activity_details";
  description =
    "Recupera os detalhes de uma atividade específica do Moodle. " +
    "Pode identificar a atividade por 'activity_id' OU por 'activity_name'. Se course_id não for fornecido, usa o curso atual do contexto.";
  schema = getActivityDetailsToolSchema;
  moodleClient: MoodleMcpClient;

  constructor(moodleClient: MoodleMcpClient) {
    super();
    this.moodleClient = moodleClient;
  }

  async _call(args: GetActivityDetailsToolInput): Promise<string> {
    const mcpServerInput: {
      activity_id?: number;
      course_id?: number;
      activity_name?: string;
    } = {};

    if (args.activity_id !== undefined) {
      mcpServerInput.activity_id = args.activity_id;
      if (args.course_id) {
        mcpServerInput.course_id = args.course_id;
      }
    } else if (args.activity_name !== undefined) {
      mcpServerInput.activity_name = args.activity_name;
      if (args.course_id) {
        mcpServerInput.course_id = args.course_id;
      }
    } else {
      return `Erro na ferramenta ${this.name}: Forneça 'activity_id' ou 'activity_name'.`;
    }

    console.log(
      `[GetActivityDetailsTool] Calling MCP tool '${
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
        `[GetActivityDetailsTool] Error in tool ${this.name}:`,
        error
      );
      return `Erro na ferramenta ${this.name}: ${errorMessage}`;
    }
  }
}
