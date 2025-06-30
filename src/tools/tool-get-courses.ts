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

// Schema Zod para validar a resposta do MCP server (array de cursos)
const courseSchema = z
  .object({
    id: z.number().describe("The unique ID of the course."),
    fullname: z.string().describe("The full, official name of the course."),
    shortname: z.string().describe("A short name or code for the course."),
    displayname: z
      .string()
      .describe("The name of the course as it is displayed to users."),
    summary: z
      .string()
      .describe("An HTML summary or description of the course."),
    visible: z
      .number()
      .describe(
        "Indicates if the course is visible to students (1 = visible, 0 = hidden)."
      ),
    startdate: z
      .number()
      .describe("Unix timestamp representing the start date of the course."),
    enddate: z
      .number()
      .describe("Unix timestamp representing the end date of the course."),
    format: z
      .string()
      .describe("The course format (e.g., topics, weeks, tiles)."),
    lang: z.string().nullable().describe("The language code for the course."),
  })
  .partial(); // .partial() para ser flexível com campos opcionais

const coursesArraySchema = z.array(courseSchema);

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

      // Parse e valida a resposta JSON do MCP server
      let parsedData: unknown;
      try {
        parsedData = JSON.parse(resultString);
      } catch (parseError) {
        console.error(
          `[GetMoodleCoursesTool] Failed to parse JSON response:`,
          parseError
        );
        return `Erro: Resposta inválida do servidor MCP para ${this.name}`;
      }

      // Valida com Zod
      const validationResult = coursesArraySchema.safeParse(parsedData);
      if (!validationResult.success) {
        console.error(
          `[GetMoodleCoursesTool] Validation failed for ${this.name}:`,
          validationResult.error.issues
        );
        console.log(
          `[GetMoodleCoursesTool] Raw data that failed validation:`,
          JSON.stringify(parsedData, null, 2)
        );
        return `Erro de validação na ferramenta ${
          this.name
        }: ${validationResult.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join(", ")}`;
      }

      console.log(
        `[GetMoodleCoursesTool] Successfully validated ${validationResult.data.length} courses`
      );

      const courses = validationResult.data;

      if (courses.length === 0) {
        return "Nenhuma disciplina encontrada com os critérios especificados.";
      }

      // Formatar a lista de cursos de forma legível para o LLM
      let formattedOutput = `Lista de ${courses.length} disciplina(s) encontrada(s):\n\n`;

      courses.forEach((course, index) => {
        formattedOutput += `${index + 1}. ${
          course.fullname || course.displayname || "Sem nome"
        }\n`;
        formattedOutput += `   ID: ${course.id}\n`;
        if (course.shortname) {
          formattedOutput += `   Código: ${course.shortname}\n`;
        }
        formattedOutput += `   Visível: ${
          course.visible === 1 ? "Sim" : "Não"
        }\n`;

        // Formatar datas se disponíveis
        if (course.startdate && course.startdate > 0) {
          const startDate = new Date(
            course.startdate * 1000
          ).toLocaleDateString("pt-PT");
          formattedOutput += `   Data início: ${startDate}\n`;
        }
        if (course.enddate && course.enddate > 0) {
          const endDate = new Date(course.enddate * 1000).toLocaleDateString(
            "pt-PT"
          );
          formattedOutput += `   Data fim: ${endDate}\n`;
        }

        formattedOutput += `\n`;
      });

      return formattedOutput;
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
