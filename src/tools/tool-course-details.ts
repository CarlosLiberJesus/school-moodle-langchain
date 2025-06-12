import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { MoodleMcpClient } from "../../lib/moodle-mcp-client.js";

// 1. Defina o schema Zod
const getMoodleCourseContentsToolSchema = z.object({
  /* moodle_token: z
    .string()
    .describe("O token de autenticação do utilizador Moodle."), */
  course_id: z.number().describe("O ID do curso a obter conteúdos."),
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
    "Recupera as secções e módulos de um curso específico do Moodle.";
  schema = getMoodleCourseContentsToolSchema;
  moodleClient: MoodleMcpClient;

  constructor(moodleClient: MoodleMcpClient) {
    super();
    this.moodleClient = moodleClient;
  }

  async _call(
    args: GetMoodleCourseContentsToolInput,
    config?: Record<string, any>
  ): Promise<string> {
    const moodleToken =
      config?.configurable?.moodle_user_token ||
      config?.metadata?.moodle_user_token;
    if (!moodleToken) {
      console.log("config ", config);
      return "Erro: Token do utilizador não fornecido para a ferramenta.";
    }
    const mcpServerInput: {
      moodle_token: string;
      course_id: number;
    } = {
      moodle_token: moodleToken,
      course_id: args.course_id,
    };
    console.log(
      `[GetMoodleCourseContentsToolInput] Calling MCP tool '${
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
