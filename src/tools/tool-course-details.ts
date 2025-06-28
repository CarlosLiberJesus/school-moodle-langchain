import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { MoodleMcpClient } from "../../lib/moodle-mcp-client.js";

// 1. Defina o schema Zod
// moodle_token is removed as it's now handled by MoodleMcpClient
const getMoodleCourseContentsToolSchema = z.object({
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
    config?: Record<string, any> // config is kept for Langchain compatibility but not used for token
  ): Promise<string> {
    // moodle_token is no longer sourced from config or args here.
    // MoodleMcpClient will inject the token.

    const mcpServerInput: {
      course_id: number;
    } = {
      course_id: args.course_id,
    };

    console.log(
      `[GetMoodleCourseContentsTool] Calling MCP tool '${ // Corrected class name in log
        this.name
      }' with input: ${JSON.stringify(mcpServerInput)} (token will be injected by client)`
    );
    try {
      // MoodleMcpClient.callMcpTool will now add the moodle_token
      const resultString = await this.moodleClient.callMcpTool(
        this.name,
        mcpServerInput // Pass only the relevant args for the MCP tool's own params
      );
      // Assuming resultString is the direct JSON string response for course contents.
      // If it needs to be parsed into a specific structure, that should be done here.
      return resultString;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : JSON.stringify(error);
      // Log o erro completo também pode ser útil aqui
      console.error(`[GetMoodleCourseContentsTool] Error in tool ${this.name}:`, error);
      return `Erro na ferramenta ${this.name}: ${errorMessage}`;
    }
  }
}
