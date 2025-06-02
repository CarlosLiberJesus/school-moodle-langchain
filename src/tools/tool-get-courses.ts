import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { MoodleMcpClient } from "../../lib/moodle-mcp-client.js";

// 1. Defina o schema Zod
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
// GetMoodleCoursesToolInput será: { course_name_filter?: string | null | undefined }

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

  // 'args' agora é automaticamente e corretamente tipado como GetMoodleCoursesToolInput
  async _call(args: GetMoodleCoursesToolInput): Promise<string> {
    console.log(
      `[GetMoodleCoursesTool._call] Received args: ${JSON.stringify(
        args,
        null,
        2
      )}`
    );

    const mcpServerInput: { course_name_filter?: string } = {};

    // Esta verificação agora deve funcionar sem erros de TypeScript
    if (args.course_name_filter && args.course_name_filter.trim() !== "") {
      // A verificação typeof args.course_name_filter === "string" é redundante
      // se o schema Zod já garante que é uma string ou null/undefined.
      // Zod já fez essa validação. Se chegou aqui, é string, null ou undefined.
      // args.course_name_filter será truthy apenas se for uma string não vazia.
      mcpServerInput.course_name_filter = args.course_name_filter.trim();
    }

    console.log(
      `[GetMoodleCoursesTool] Calling MCP tool '${
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
      console.error(
        `[GetMoodleCoursesTool] Error in tool ${this.name}: ${errorMessage}`,
        error
      );
      return `Erro na ferramenta ${this.name}: ${errorMessage}`;
    }
  }
}
