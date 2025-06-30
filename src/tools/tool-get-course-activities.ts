import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { MoodleMcpClient } from "../../lib/moodle-mcp-client.js";

// Schema permite course_id opcional - se não fornecido, usa o do MoodleClient
const getCourseActivitiesToolSchema = z.object({
  course_id: z
    .number()
    .optional()
    .describe(
      "ID do curso para recuperar atividades. Se não fornecido, usa o curso atual do contexto."
    ),
});

const activitySchema = z.object({
  id: z.number().describe("O ID da atividade (module ID)."),
  name: z.string().describe("O nome da atividade."),
  url: z.string().nullable().describe("A URL da atividade."),
  fileurl: z.string().nullable().describe("A URL do arquivo da atividade."),
  timemodified: z
    .number()
    .describe("Timestamp da última modificação da atividade."),
});

type GetCourseActivitiesToolInput = z.infer<
  typeof getCourseActivitiesToolSchema
>;

export class GetCourseActivitiesTool extends StructuredTool<
  typeof getCourseActivitiesToolSchema
> {
  name = "get_course_activities";
  description =
    "Recupera uma lista de todas as atividades para um curso específico no Moodle. Se course_id não for fornecido, usa o curso atual do contexto.";
  schema = getCourseActivitiesToolSchema;
  moodleClient: MoodleMcpClient;

  constructor(moodleClient: MoodleMcpClient) {
    super();
    this.moodleClient = moodleClient;
  }

  async _call(args: GetCourseActivitiesToolInput): Promise<string> {
    // Se course_id não for fornecido nos args, o MoodleClient irá injetar automaticamente
    const mcpServerInput = args.course_id ? { course_id: args.course_id } : {};

    console.log(
      `[GetCourseActivitiesTool] Calling MCP tool '${
        this.name
      }' with input: ${JSON.stringify(
        mcpServerInput
      )} (token e course_id serão injetados pelo MoodleClient se necessário)`
    );

    try {
      const result = await this.moodleClient.callMcpTool(
        this.name,
        mcpServerInput
      );

      let parsedResult: unknown;
      try {
        parsedResult = JSON.parse(result);
      } catch (parseError) {
        console.error(
          `[GetCourseActivitiesTool] Error parsing JSON from MCP tool ${this.name}: ${parseError}`
        );
        return `Erro ao processar resposta da ferramenta ${this.name}: JSON inválido.`;
      }

      // Validar estrutura usando Zod schema
      try {
        const activitiesArray = z.array(activitySchema);
        const validatedResult = activitiesArray.parse(parsedResult);

        console.log(
          `[GetCourseActivitiesTool] Successfully validated ${validatedResult.length} activities`
        );

        // Converter para string legível para o LLM processar
        const activitiesSummary = validatedResult
          .map(
            (activity) =>
              `ID: ${activity.id}, Nome: "${
                activity.name
              }", Data modificação: ${
                activity.timemodified > 0
                  ? new Date(activity.timemodified * 1000)
                      .toISOString()
                      .split("T")[0]
                  : "N/A"
              }`
          )
          .join("\n");

        return `Lista de ${validatedResult.length} atividades da disciplina:\n\n${activitiesSummary}`;
      } catch (validationError) {
        console.error(
          `[GetCourseActivitiesTool] Schema validation error:`,
          validationError
        );
        console.error(
          `[GetCourseActivitiesTool] Raw result from MCP:`,
          JSON.stringify(parsedResult, null, 2)
        );
        return `Erro na validação dos dados retornados: ${
          validationError instanceof Error
            ? validationError.message
            : "Estrutura inválida"
        }`;
      }
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
