import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { MoodleMcpClient } from "../../lib/moodle-mcp-client.js";

const getCourseActivitiesToolSchema = z.object({
  course_id: z.coerce
    .number() // Coerce to number
    .describe("O ID do curso para o qual as atividades devem ser recuperadas."),
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
    args: GetCourseActivitiesToolInput,
    config?: Record<string, any>
  ): Promise<GetCourseActivitiesToolOutput | string> {
    const { course_id } = args;
    const mcpServerInput = {
      course_id,
    };

    console.log(
      `[GetCourseActivitiesTool] Calling MCP tool '${
        this.name
      }' with input: ${JSON.stringify(
        mcpServerInput
      )} (token will be injected by client)`
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
