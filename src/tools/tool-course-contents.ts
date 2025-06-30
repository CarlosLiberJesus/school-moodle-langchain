import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { MoodleMcpClient } from "../../lib/moodle-mcp-client.js";

// Schema permite course_id opcional - se não fornecido, usa o do MoodleClient
const getMoodleCourseContentsToolSchema = z.object({
  course_id: z
    .number()
    .optional()
    .describe(
      "ID do curso para recuperar conteúdos. Se não fornecido, usa o curso atual do contexto."
    ),
});

// Schema Zod para validar a resposta do MCP server (array de secções)
const moduleContentSchema = z.object({
  type: z.string().describe("Type of content (e.g., file, url)."),
  filename: z.string().nullable().describe("Name of the file."),
  fileurl: z
    .string()
    .nullable()
    .describe("Direct URL to download/access the file."),
  mimetype: z.string().nullable().describe("MIME type of the file."),
});

const moduleSchema = z
  .object({
    id: z.number().describe("The unique ID of this module within the course."),
    instance: z.number().describe("The instance ID of this module type."),
    name: z.string().describe("The display name of the module."),
    url: z.string().nullable().describe("Direct URL to view this module."),
    modname: z
      .string()
      .describe("The type of the module (e.g., assign, page, resource, quiz)."),
    modplural: z.string().describe("Plural name of the module type."),
    description: z
      .string()
      .nullable()
      .describe("HTML description of the module."),
    intro: z.string().nullable().describe("HTML introduction for the module."),
    visible: z
      .number()
      .describe("Visibility of the module (1 = visible, 0 = hidden)."),
    noviewlink: z
      .boolean()
      .describe(
        "If true, this module does not have a separate view page/link."
      ),
    contents: z
      .array(moduleContentSchema)
      .nullable()
      .describe("Associated files or content parts."),
  })
  .partial(); // .partial() para ser flexível com campos opcionais

const sectionSchema = z
  .object({
    id: z.number().describe("The unique ID of this course section."),
    name: z.string().describe("The name of the course section."),
    summary: z
      .string()
      .describe("HTML summary/description for the section itself."),
    visible: z
      .number()
      .describe("Visibility of the section (1 = visible, 0 = hidden)."),
    modules: z
      .array(moduleSchema)
      .describe("An array of modules within this section."),
  })
  .partial(); // .partial() para ser flexível com campos opcionais

const courseContentsSchema = z.array(sectionSchema);

// 2. Tipo do input
type GetMoodleCourseContentsToolInput = z.infer<
  typeof getMoodleCourseContentsToolSchema
>;

export class GetMoodleCourseContentsTool extends StructuredTool<
  typeof getMoodleCourseContentsToolSchema
> {
  name = "get_course_contents";
  description =
    "Recupera as secções e módulos de um curso específico do Moodle. Se course_id não for fornecido, usa o curso atual do contexto.";
  schema = getMoodleCourseContentsToolSchema;
  moodleClient: MoodleMcpClient;

  constructor(moodleClient: MoodleMcpClient) {
    super();
    this.moodleClient = moodleClient;
  }

  async _call(args: GetMoodleCourseContentsToolInput): Promise<string> {
    // Se course_id não for fornecido nos args, o MoodleClient irá injetar automaticamente
    const mcpServerInput = args.course_id ? { course_id: args.course_id } : {};

    console.log(
      `[GetMoodleCourseContentsTool] Calling MCP tool '${
        this.name
      }' with input: ${JSON.stringify(
        mcpServerInput
      )} (token e course_id serão injetados pelo MoodleClient se necessário)`
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
          `[GetMoodleCourseContentsTool] Failed to parse JSON response:`,
          parseError
        );
        return `Erro: Resposta inválida do servidor MCP para ${this.name}`;
      }

      // Valida com Zod
      const validationResult = courseContentsSchema.safeParse(parsedData);
      if (!validationResult.success) {
        console.error(
          `[GetMoodleCourseContentsTool] Validation failed for ${this.name}:`,
          validationResult.error.issues
        );
        console.log(
          `[GetMoodleCourseContentsTool] Raw data that failed validation:`,
          JSON.stringify(parsedData, null, 2)
        );
        return `Erro de validação na ferramenta ${
          this.name
        }: ${validationResult.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join(", ")}`;
      }

      console.log(
        `[GetMoodleCourseContentsTool] Successfully validated ${validationResult.data.length} sections`
      );

      const sections = validationResult.data;

      if (sections.length === 0) {
        return "Nenhuma secção encontrada no curso.";
      }

      // Formatar as secções e módulos de forma legível para o LLM
      let formattedOutput = `Conteúdos do curso (${sections.length} secção(ões)):\n\n`;

      sections.forEach((section, sectionIndex) => {
        formattedOutput += `Secção ${sectionIndex + 1}: ${
          section.name || "Sem nome"
        }\n`;
        formattedOutput += `  ID: ${section.id}\n`;
        if (section.summary && section.summary.trim()) {
          const cleanSummary = section.summary.replace(/<[^>]*>/g, "").trim();
          if (cleanSummary) {
            formattedOutput += `  Descrição: ${cleanSummary}\n`;
          }
        }
        formattedOutput += `  Visível: ${
          section.visible === 1 ? "Sim" : "Não"
        }\n`;

        if (section.modules && section.modules.length > 0) {
          formattedOutput += `  Módulos (${section.modules.length}):\n`;
          section.modules.forEach((module, moduleIndex) => {
            formattedOutput += `    ${moduleIndex + 1}. ${
              module.name || "Sem nome"
            }\n`;
            formattedOutput += `       ID: ${module.id}, Tipo: ${
              module.modname || "N/A"
            }\n`;
            if (module.url) {
              formattedOutput += `       URL: ${module.url}\n`;
            }
            if (module.description) {
              const cleanDesc = module.description
                .replace(/<[^>]*>/g, "")
                .trim();
              if (cleanDesc) {
                formattedOutput += `       Descrição: ${cleanDesc.substring(
                  0,
                  100
                )}${cleanDesc.length > 100 ? "..." : ""}\n`;
              }
            }
            if (module.contents && module.contents.length > 0) {
              formattedOutput += `       Ficheiros (${module.contents.length}): `;
              const fileNames = module.contents
                .map((c) => c.filename || "sem nome")
                .join(", ");
              formattedOutput += `${fileNames}\n`;
            }
          });
        } else {
          formattedOutput += `  Sem módulos nesta secção.\n`;
        }
        formattedOutput += `\n`;
      });

      return formattedOutput;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : JSON.stringify(error);
      console.error(
        `[GetMoodleCourseContentsTool] Error in tool ${this.name}:`,
        error
      );
      return `Erro na ferramenta ${this.name}: ${errorMessage}`;
    }
  }
}
