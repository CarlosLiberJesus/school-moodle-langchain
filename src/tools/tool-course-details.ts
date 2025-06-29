import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { MoodleMcpClient } from "../../lib/moodle-mcp-client.js";

// 1. Defina o schema Zod
// moodle_token is removed as it's now handled by MoodleMcpClient
// course_id is removed from schema, will be sourced from config
const getMoodleCourseContentsToolSchema = z.object({
  // Nenhum argumento esperado diretamente do LLM para esta tool.
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
    "Recupera as secções e módulos de um curso específico do Moodle. O ID do curso é gerido automaticamente pelo sistema.";
  schema = getMoodleCourseContentsToolSchema;
  moodleClient: MoodleMcpClient;

  constructor(moodleClient: MoodleMcpClient) {
    super();
    this.moodleClient = moodleClient;
  }

  async _call(
    args: GetMoodleCourseContentsToolInput, // args estará vazio {}
    config?: Record<string, any>
  ): Promise<string> {
    const course_id = config?.configurable?.moodle_course_id;

    if (typeof course_id !== 'number') {
      console.error(
        `[GetMoodleCourseContentsTool] Erro: course_id não fornecido ou inválido no config. Recebido: ${course_id}`
      );
      return `Erro na ferramenta ${this.name}: O ID do curso (course_id) é obrigatório e deve ser um número. Verifique se o contexto do curso está definido.`;
    }

    const mcpServerInput = {
      course_id: course_id,
    };

    console.log(
      `[GetMoodleCourseContentsTool] Calling MCP tool '${
        this.name
      }' with input: ${JSON.stringify(mcpServerInput)} (token will be injected by client, course_id from config)`
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
      console.error(`[GetMoodleCourseContentsTool] Error in tool ${this.name}:`, error);
      return `Erro na ferramenta ${this.name}: ${errorMessage}`;
    }
  }
}
