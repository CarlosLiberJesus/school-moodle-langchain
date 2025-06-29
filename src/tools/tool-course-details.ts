import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { MoodleMcpClient } from "../../lib/moodle-mcp-client.js";

// Schema permite course_id opcional - se não fornecido, usa o do MoodleClient
const getMoodleCourseContentsToolSchema = z.object({
  course_id: z
    .number()
    .optional()
    .describe(
      "ID do curso para recuperar conteúdos. Se não fornecido, usa o curso atual do contexto."
    ),
});

// 2. Tipo do input
type GetMoodleCourseContentsToolInput = z.infer<
  typeof getMoodleCourseContentsToolSchema
>;

export class GetMoodleCourseContentsTool extends StructuredTool<
  typeof getMoodleCourseContentsToolSchema
> {
  name = "get_course_contents";
  description =
    "Recupera as secções e módulos de um curso específico do Moodle. Se course_id não for fornecido, usa o curso atual do contexto.";
  schema = getMoodleCourseContentsToolSchema;
  moodleClient: MoodleMcpClient;

  constructor(moodleClient: MoodleMcpClient) {
    super();
    this.moodleClient = moodleClient;
  }

  async _call(args: GetMoodleCourseContentsToolInput): Promise<string> {
    // Se course_id não for fornecido nos args, o MoodleClient irá injetar automaticamente
    const mcpServerInput = args.course_id ? { course_id: args.course_id } : {};

    console.log(
      `[GetMoodleCourseContentsTool] Calling MCP tool '${
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
        `[GetMoodleCourseContentsTool] Error in tool ${this.name}:`,
        error
      );
      return `Erro na ferramenta ${this.name}: ${errorMessage}`;
    }
  }
}
