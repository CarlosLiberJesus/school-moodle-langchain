import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { MoodleMcpClient } from "../../lib/moodle-mcp-client.js";

// Schema para os argumentos que o LLM vai preencher
const fetchActivityContentToolSchema = z.object({
  activity_id: z
    .number()
    .optional()
    .describe(
      "O ID da atividade (Course Module ID - cmid) para obter o conteúdo. Use isto OU course_id e activity_name."
    ),
  course_id: z
    .number()
    .optional()
    .describe(
      "O ID do curso onde a atividade está localizada. Necessário se activity_id não for fornecido."
    ),
  activity_name: z
    .string()
    .optional()
    .describe(
      "O nome (ou parte do nome) da atividade. Necessário se activity_id não for fornecido e course_id for fornecido."
    ),
});

// Tipagem para os argumentos (inferida do schema)
type FetchActivityContentToolInput = z.infer<
  typeof fetchActivityContentToolSchema
>;

export class FetchActivityContentTool extends StructuredTool /*<typeof fetchActivityContentToolSchema>*/ {
  // Removi a tipagem genérica por agora para simplificar
  name = "fetch_activity_content";
  description =
    "Obtém o conteúdo detalhado de uma atividade específica do Moodle (descrição, texto, ficheiros associados, etc). " +
    "Pode identificar a atividade por 'activity_id' OU por 'course_id' juntamente com 'activity_name'.";
  schema = fetchActivityContentToolSchema;
  moodleClient; // Deveria ter o tipo do seu MoodleMcpClient

  constructor(moodleClient: MoodleMcpClient) {
    super();
    this.moodleClient = moodleClient;
  }

  // Manter a assinatura do _call consistente com as outras tools que funcionam
  // Se as suas outras tools usam (args, config), mantenha assim.
  // Se elas usam (args, runManager, config), adicione runManager.
  // Vou assumir que o config é o segundo parâmetro relevante para o token.
  async _call(
    args: FetchActivityContentToolInput, // O tipo será inferido
    config: Record<string, any> | undefined // Para o token
  ) {
    const moodleToken =
      config?.configurable?.moodle_user_token ||
      config?.metadata?.moodle_user_token;
    const courseIdFromConfig =
      config?.configurable?.moodle_course_id ||
      config?.metadata?.moodle_course_id;

    if (!moodleToken) {
      return "Erro: Token do utilizador não fornecido para a ferramenta fetch_activity_content.";
    }

    const mcpServerInput: {
      moodle_token: string;
      activity_id?: number;
      course_id?: number;
      activity_name?: string;
    } = {
      moodle_token: moodleToken,
    };

    if (args.activity_id !== undefined) {
      // Verificar se a propriedade existe e tem valor
      mcpServerInput.activity_id = args.activity_id;
    } else if (
      args.course_id !== undefined &&
      args.activity_name !== undefined
    ) {
      mcpServerInput.course_id = args.course_id;
      mcpServerInput.activity_name = args.activity_name;
    } else if (
      courseIdFromConfig !== undefined &&
      args.activity_name !== undefined
    ) {
      console.log(
        `[FetchActivityContentTool] Usando course_id (${courseIdFromConfig}) do contexto configurável com activity_name: ${args.activity_name}`
      );
      mcpServerInput.course_id = courseIdFromConfig;
      mcpServerInput.activity_name = args.activity_name;
    } else {
      return "Erro: Para usar fetch_activity_content, forneça 'activity_id', OU ('course_id' E 'activity_name'). Se o curso já estiver em contexto, apenas 'activity_name' pode ser suficiente.";
    }

    console.log(
      `[FetchActivityContentTool] Calling MCP tool '${
        this.name
      }' with input: ${JSON.stringify(mcpServerInput)}`
    );
    try {
      // Assumindo que o seu moodleClient.callMcpTool espera o nome da tool e o payload completo (incluindo o token)
      const resultString = await this.moodleClient.callMcpTool(
        this.name,
        mcpServerInput
      );
      return resultString;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : JSON.stringify(error);
      return `Erro na ferramenta ${this.name}: ${errorMessage}`;
    }
  }
}
