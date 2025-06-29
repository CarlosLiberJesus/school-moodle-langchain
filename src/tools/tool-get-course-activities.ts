import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { MoodleMcpClient } from "../../lib/moodle-mcp-client.js";

// course_id removido do schema. Será obtido do config.
const getCourseActivitiesToolSchema = z.object({
  // Nenhum argumento esperado diretamente do LLM para esta tool.
  // course_id será fornecido pelo sistema via config.
});

const activitySchema = z.object({
  id: z.string().describe("O ID da atividade."),
  name: z.string().describe("O nome da atividade."),
  url: z.string().optional().describe("A URL da atividade."),
  fileurl: z.string().optional().describe("A URL do arquivo da atividade."),
  timemodified: z
    .number()
    .describe("Timestamp da última modificação da atividade."),
});

type GetCourseActivitiesToolInput = z.infer<
  typeof getCourseActivitiesToolSchema
>;

type Activity = z.infer<typeof activitySchema>;
type GetCourseActivitiesToolOutput = Activity[];

export class GetCourseActivitiesTool extends StructuredTool<
  typeof getCourseActivitiesToolSchema
> {
  name = "get_course_activities";
  description =
    "Recupera uma lista de todas as atividades para um curso específico no Moodle.";
  schema = getCourseActivitiesToolSchema;
  moodleClient: MoodleMcpClient;

  constructor(moodleClient: MoodleMcpClient) {
    super();
    this.moodleClient = moodleClient;
  }

  async _call(
    args: GetCourseActivitiesToolInput, // args estará vazio {}
    config?: Record<string, any>
  ): Promise<GetCourseActivitiesToolOutput | string> {
    const course_id = config?.configurable?.moodle_course_id;

    if (typeof course_id !== 'number') {
      console.error(
        `[GetCourseActivitiesTool] Erro: course_id não fornecido ou inválido no config. Recebido: ${course_id}`
      );
      return `Erro na ferramenta ${this.name}: O ID do curso (course_id) é obrigatório e deve ser um número. Verifique se o contexto do curso está definido.`;
    }

    const mcpServerInput = {
      course_id, // course_id obtido do config
    };

    console.log(
      `[GetCourseActivitiesTool] Calling MCP tool '${
        this.name
      }' with input: ${JSON.stringify(
        mcpServerInput
      )} (token will be injected by client, course_id from config)`
    );

    try {
      const result = await this.moodleClient.callMcpTool(
        this.name,
        mcpServerInput
      );
      let parsedResult: GetCourseActivitiesToolOutput;
      try {
        parsedResult = JSON.parse(result);
      } catch (parseError) {
        console.error(
          `[GetCourseActivitiesTool] Error parsing result from MCP tool ${this.name}: ${parseError}`
        );
        return `Erro ao processar resposta da ferramenta ${this.name}: Formato inválido.`;
      }
      return parsedResult;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : JSON.stringify(error);
      console.error(
        `[GetCourseActivitiesTool] Error in tool ${this.name}: ${errorMessage}`,
        error
      );
      return `Erro na ferramenta ${this.name}: ${errorMessage}`;
    }
  }
}
