import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { MoodleMcpClient } from "../../lib/moodle-mcp-client.js";

// Schema permite course_id opcional - se não fornecido, usa o do MoodleClient
const getActivityDetailsToolSchema = z.object({
  activity_id: z
    .number()
    .optional()
    .describe(
      "O ID da atividade (Course Module ID - cmid) para obter os detalhes. Use isto OU activity_name."
    ),
  course_id: z
    .number()
    .optional()
    .describe("ID do curso. Se não fornecido, usa o curso atual do contexto."),
  activity_name: z
    .string()
    .optional()
    .describe(
      "O nome (ou parte do nome) da atividade. Use isto se não tiver o activity_id."
    ),
});

// Schema Zod para validar a resposta do MCP server
const activityDetailsSchema = z
  .object({
    id: z.number().describe("The course module ID (cmid)."),
    course: z.number().describe("The course ID this module belongs to."),
    module: z
      .number()
      .describe("The module ID (internal Moodle ID for the type of module)."),
    instance: z.number().describe("The instance ID of this module."),
    name: z.string().describe("The display name of the activity."),
    url: z
      .string()
      .nullable()
      .describe("Direct URL to view this activity/module."),
    modname: z
      .string()
      .describe("The type of the module (e.g., assign, page, resource, quiz)."),
    description: z
      .string()
      .nullable()
      .describe("HTML description/intro for the activity."),
    intro: z
      .string()
      .nullable()
      .describe("HTML introduction, similar to description."),
    contents: z
      .array(
        z.object({
          type: z.string().describe("Type of content (e.g., file, url)."),
          filename: z.string().nullable().describe("Name of the file."),
          filepath: z
            .string()
            .nullable()
            .describe("Path of the file within Moodle."),
          fileurl: z
            .string()
            .nullable()
            .describe("Direct URL to download/access the file."),
          mimetype: z.string().nullable().describe("MIME type of the file."),
        })
      )
      .nullable()
      .describe("Associated files or content parts."),
    contentsinfo: z
      .string()
      .nullable()
      .describe("JSON string with information about the main content."),
    visible: z.number().describe("Visibility (1 = visible, 0 = hidden)."),
  })
  .partial(); // .partial() para ser flexível com campos opcionais

type GetActivityDetailsToolInput = z.infer<typeof getActivityDetailsToolSchema>;

export class GetActivityDetailsTool extends StructuredTool<
  typeof getActivityDetailsToolSchema
> {
  name = "get_activity_details";
  description =
    "Recupera os detalhes de uma atividade específica do Moodle. " +
    "Pode identificar a atividade por 'activity_id' OU por 'activity_name'. Se course_id não for fornecido, usa o curso atual do contexto.";
  schema = getActivityDetailsToolSchema;
  moodleClient: MoodleMcpClient;

  constructor(moodleClient: MoodleMcpClient) {
    super();
    this.moodleClient = moodleClient;
  }

  async _call(args: GetActivityDetailsToolInput): Promise<string> {
    const mcpServerInput: {
      activity_id?: number;
      course_id?: number;
      activity_name?: string;
    } = {};

    if (args.activity_id !== undefined) {
      mcpServerInput.activity_id = args.activity_id;
      if (args.course_id) {
        mcpServerInput.course_id = args.course_id;
      }
    } else if (args.activity_name !== undefined) {
      mcpServerInput.activity_name = args.activity_name;
      if (args.course_id) {
        mcpServerInput.course_id = args.course_id;
      }
    } else {
      return `Erro na ferramenta ${this.name}: Forneça 'activity_id' ou 'activity_name'.`;
    }

    console.log(
      `[GetActivityDetailsTool] Calling MCP tool '${
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
          `[GetActivityDetailsTool] Failed to parse JSON response:`,
          parseError
        );
        return `Erro: Resposta inválida do servidor MCP para ${this.name}`;
      }

      // Valida com Zod
      const validationResult = activityDetailsSchema.safeParse(parsedData);
      if (!validationResult.success) {
        console.error(
          `[GetActivityDetailsTool] Validation failed for ${this.name}:`,
          validationResult.error.issues
        );
        console.log(
          `[GetActivityDetailsTool] Raw data that failed validation:`,
          JSON.stringify(parsedData, null, 2)
        );
        return `Erro de validação na ferramenta ${
          this.name
        }: ${validationResult.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join(", ")}`;
      }

      console.log(
        `[GetActivityDetailsTool] Successfully validated activity details`
      );

      const activity = validationResult.data;

      // Formatar os detalhes da atividade de forma legível para o LLM
      let formattedOutput = `Detalhes da atividade:\n\n`;
      formattedOutput += `ID: ${activity.id || "N/A"}\n`;
      formattedOutput += `Nome: ${activity.name || "N/A"}\n`;
      formattedOutput += `Tipo: ${activity.modname || "N/A"}\n`;
      formattedOutput += `Curso: ${activity.course || "N/A"}\n`;
      formattedOutput += `Visível: ${activity.visible === 1 ? "Sim" : "Não"}\n`;

      if (activity.url) {
        formattedOutput += `URL: ${activity.url}\n`;
      }

      if (activity.description) {
        formattedOutput += `Descrição: ${activity.description
          .replace(/<[^>]*>/g, "")
          .trim()}\n`;
      } else if (activity.intro) {
        formattedOutput += `Introdução: ${activity.intro
          .replace(/<[^>]*>/g, "")
          .trim()}\n`;
      }

      if (activity.contents && activity.contents.length > 0) {
        formattedOutput += `\nConteúdos associados:\n`;
        activity.contents.forEach((content, index) => {
          formattedOutput += `  ${index + 1}. ${
            content.filename || content.type || "Sem nome"
          }\n`;
          if (content.fileurl) {
            formattedOutput += `     URL: ${content.fileurl}\n`;
          }
          if (content.mimetype) {
            formattedOutput += `     Tipo: ${content.mimetype}\n`;
          }
        });
      }

      return formattedOutput;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : JSON.stringify(error);
      console.error(
        `[GetActivityDetailsTool] Error in tool ${this.name}:`,
        error
      );
      return `Erro na ferramenta ${this.name}: ${errorMessage}`;
    }
  }
}
