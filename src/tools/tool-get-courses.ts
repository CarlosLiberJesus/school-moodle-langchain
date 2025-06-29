import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { MoodleMcpClient } from "../../lib/moodle-mcp-client.js";

// 1. Defina o schema Zod
// moodle_token is removed as it's now handled by MoodleMcpClient
const getMoodleCoursesToolSchema = z.object({
  course_name_filter: z
    .string()
    .optional() // Permite que a chave esteja ausente ou o valor seja undefined
    .nullable() // Permite que o valor seja explicitamente null
    .describe(
      "Texto para filtrar os nomes das disciplinas. " +
        "Se não for fornecido, for nulo, ou se for uma string vazia, todas as disciplinas são retornadas."
    ),
});

// 2. Defina o tipo do input a partir do schema Zod para uso explícito se necessário
type GetMoodleCoursesToolInput = z.infer<typeof getMoodleCoursesToolSchema>;

export class GetMoodleCoursesTool extends StructuredTool<
  typeof getMoodleCoursesToolSchema
> {
  name = "get_courses";
  description =
    "Recupera uma lista de disciplinas (cursos) do Moodle. Pode filtrar opcionalmente pelo nome da disciplina.";

  // Atribua a instância do schema aqui
  schema = getMoodleCoursesToolSchema;

  moodleClient: MoodleMcpClient;

  constructor(moodleClient: MoodleMcpClient) {
    super();
    this.moodleClient = moodleClient;
  }

  async _call(args: GetMoodleCoursesToolInput): Promise<string> {
    // MoodleMcpClient irá injetar automaticamente o token
    const mcpServerInput: { course_name_filter?: string } = {};

    if (args.course_name_filter && args.course_name_filter.trim() !== "") {
      mcpServerInput.course_name_filter = args.course_name_filter.trim();
    }

    console.log(
      `[GetMoodleCoursesTool] Calling MCP tool '${
        this.name
      }' with input: ${JSON.stringify(
        mcpServerInput
      )} (token será injetado pelo MoodleClient)`
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
        `[GetMoodleCoursesTool] Error in tool ${this.name}: ${errorMessage}`,
        error
      );
      return `Erro na ferramenta ${this.name}: ${errorMessage}`;
    }
  }
}
