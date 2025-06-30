import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { MoodleMcpClient } from "../../lib/moodle-mcp-client.js";

// Schema permite course_id opcional - se não fornecido, usa o do MoodleClient
const fetchActivityContentToolSchema = z.object({
  activity_id: z
    .number()
    .optional()
    .describe(
      "O ID da atividade (Course Module ID - cmid) para obter o conteúdo. Use isto OU activity_name."
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
const activityContentSchema = z.object({
  activityName: z.string().describe("The name of the activity."),
  activityType: z
    .string()
    .describe("The Moodle module type (e.g., assign, page, resource)."),
  activityUrl: z
    .string()
    .describe("The main URL to view the activity in Moodle."),
  contentType: z
    .enum([
      "text",
      "html_cleaned",
      "file_placeholder",
      "url_details",
      "error",
      "empty",
    ])
    .describe("The nature of the main content provided."),
  content: z
    .string()
    .describe("The main textual content extracted from the activity."),
  files: z
    .array(
      z.object({
        filename: z.string().describe("The name of the file."),
        fileurl: z
          .string()
          .describe("The direct URL to access/download the file."),
        mimetype: z.string().describe("The MIME type of the file."),
      })
    )
    .describe("A list of files associated with this activity."),
});

// Tipagem para os argumentos (inferida do schema)
type FetchActivityContentToolInput = z.infer<
  typeof fetchActivityContentToolSchema
>;

export class FetchActivityContentTool extends StructuredTool<
  typeof fetchActivityContentToolSchema
> {
  name = "fetch_activity_content";
  description =
    "Obtém o conteúdo detalhado de uma atividade específica do Moodle (descrição, texto, ficheiros associados, etc). " +
    "Pode identificar a atividade por 'activity_id' OU por 'activity_name'. Se course_id não for fornecido, usa o curso atual do contexto.";
  schema = fetchActivityContentToolSchema;
  moodleClient: MoodleMcpClient;

  constructor(moodleClient: MoodleMcpClient) {
    super();
    this.moodleClient = moodleClient;
  }

  async _call(args: FetchActivityContentToolInput): Promise<string> {
    const mcpServerInput: {
      activity_id?: number;
      course_id?: number;
      activity_name?: string;
    } = {};

    if (args.activity_id !== undefined) {
      mcpServerInput.activity_id = args.activity_id;
      // Se course_id foi fornecido nos args, usa-o; senão o MoodleClient irá injetar automaticamente
      if (args.course_id) {
        mcpServerInput.course_id = args.course_id;
      }
    } else if (args.activity_name !== undefined) {
      mcpServerInput.activity_name = args.activity_name;
      // Para pesquisar por nome, course_id é normalmente necessário
      if (args.course_id) {
        mcpServerInput.course_id = args.course_id;
      }
      // Se não foi fornecido, o MoodleClient irá injetar automaticamente se disponível
    } else {
      return `Erro na ferramenta ${this.name}: Forneça 'activity_id' ou 'activity_name'.`;
    }

    console.log(
      `[FetchActivityContentTool] Calling MCP tool '${
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
          `[FetchActivityContentTool] Failed to parse JSON response:`,
          parseError
        );
        return `Erro: Resposta inválida do servidor MCP para ${this.name}`;
      }

      // Valida com Zod
      const validationResult = activityContentSchema.safeParse(parsedData);
      if (!validationResult.success) {
        console.error(
          `[FetchActivityContentTool] Validation failed for ${this.name}:`,
          validationResult.error.issues
        );
        console.log(
          `[FetchActivityContentTool] Raw data that failed validation:`,
          JSON.stringify(parsedData, null, 2)
        );
        return `Erro de validação na ferramenta ${
          this.name
        }: ${validationResult.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join(", ")}`;
      }

      console.log(
        `[FetchActivityContentTool] Successfully validated activity content`
      );

      const activityContent = validationResult.data;

      // Formatar o conteúdo da atividade de forma legível para o LLM
      let formattedOutput = `Conteúdo da atividade:\n\n`;
      formattedOutput += `Nome: ${activityContent.activityName}\n`;
      formattedOutput += `Tipo: ${activityContent.activityType}\n`;
      formattedOutput += `URL: ${activityContent.activityUrl}\n`;
      formattedOutput += `Tipo de conteúdo: ${activityContent.contentType}\n\n`;

      if (activityContent.content && activityContent.content.trim()) {
        formattedOutput += `Conteúdo:\n${activityContent.content.trim()}\n\n`;
      }

      if (activityContent.files && activityContent.files.length > 0) {
        formattedOutput += `Ficheiros associados (${activityContent.files.length}):\n`;
        activityContent.files.forEach((file, index) => {
          formattedOutput += `  ${index + 1}. ${file.filename}\n`;
          formattedOutput += `     URL: ${file.fileurl}\n`;
          formattedOutput += `     Tipo: ${file.mimetype}\n`;
        });
      } else {
        formattedOutput += `Sem ficheiros associados.\n`;
      }

      return formattedOutput;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : JSON.stringify(error);
      console.error(
        `[FetchActivityContentTool] Error in tool ${this.name}:`,
        error
      );
      return `Erro na ferramenta ${this.name}: ${errorMessage}`;
    }
  }
}
