import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { MoodleMcpClient } from "../../lib/moodle-mcp-client.js";

// Define the input schema using Zod
const getCourseActivitiesToolSchema = z.object({
  moodle_token: z.string().describe("O token do utilizador Moodle."),
  course_id: z
    .string()
    .describe("O ID do curso para o qual as atividades devem ser recuperadas."),
});

// Define the output schema for the activities
const activitySchema = z.object({
  id: z.string().describe("O ID da atividade."),
  name: z.string().describe("O nome da atividade."),
  url: z.string().optional().describe("A URL da atividade."),
  fileurl: z.string().optional().describe("A URL do arquivo da atividade."),
  timemodified: z
    .number()
    .describe("Timestamp da última modificação da atividade."),
});

// Define the type for the input based on the schema
type GetCourseActivitiesToolInput = z.infer<
  typeof getCourseActivitiesToolSchema
>;

// Define the type for the output based on the activity schema
type Activity = z.infer<typeof activitySchema>;
type GetCourseActivitiesToolOutput = Activity[]; // Array of activities

export class GetCourseActivitiesTool extends StructuredTool<
  typeof getCourseActivitiesToolSchema
> {
  name = "get_course_activities";
  description =
    "Recupera uma lista de todas as atividades para um curso específico no Moodle.";

  // Assign the schema instance here
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
    const { moodle_token, course_id } = args;

    if (!moodle_token) {
      return "Erro: Token do utilizador não fornecido.";
    }

    const mcpServerInput = {
      moodle_token,
      course_id,
    };

    console.log(
      `[GetCourseActivitiesTool] Calling MCP tool '${
        this.name
      }' with input: ${JSON.stringify(mcpServerInput)}`
    );

    try {
      const result = await this.moodleClient.callMcpTool(
        this.name,
        mcpServerInput
      );
      return result as unknown as GetCourseActivitiesToolOutput; // Assuming the result is correctly typed
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
