import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { MoodleMcpClient } from "../../lib/moodle-mcp-client.js";

// Define the input schema using Zod
// moodle_token is removed as it will be injected by MoodleMcpClient
const getCourseActivitiesToolSchema = z.object({
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
    // moodle_token is no longer expected in args
    const { course_id } = args;

    // Input for MCP server will not include moodle_token here,
    // as MoodleMcpClient will inject it.
    const mcpServerInput = {
      course_id,
    };

    console.log(
      `[GetCourseActivitiesTool] Calling MCP tool '${
        this.name
      }' with input: ${JSON.stringify(mcpServerInput)} (token will be injected by client)`
    );

    try {
      // MoodleMcpClient.callMcpTool will now add the moodle_token
      const result = await this.moodleClient.callMcpTool(
        this.name,
        mcpServerInput
      );
      // It's good practice to validate the structure of 'result' if it's ambiguous
      // For now, we assume it's a string that can be parsed or is directly the output.
      // If 'result' is a string representation of JSON, it needs parsing.
      // If MoodleMcpClient's callMcpTool already returns the final parsed string (like content[0].text),
      // then this direct cast might be okay, but often it returns a JSON string.
      // Let's assume MoodleMcpClient returns the string that is the actual content.
      // This might need adjustment if the result is a JSON string of GetCourseActivitiesToolOutput

      // Given MoodleMcpClient's current implementation returns a string (intended to be the final text content),
      // and this tool expects GetCourseActivitiesToolOutput (Activity[]),
      // there's a mismatch if the string is not a direct JSON representation of Activity[].
      // The MCP server for "get_course_activities" should return a JSON string that parses into Activity[].

      // Let's parse, assuming the string from callMcpTool is a JSON array of activities
      let parsedResult: GetCourseActivitiesToolOutput;
      try {
        parsedResult = JSON.parse(result);
      } catch (parseError) {
        console.error(`[GetCourseActivitiesTool] Error parsing result from MCP tool ${this.name}: ${parseError}`);
        return `Erro ao processar resposta da ferramenta ${this.name}: Formato inválido.`;
      }
      // TODO: Add Zod validation here for parsedResult against z.array(activitySchema) for robustness
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
