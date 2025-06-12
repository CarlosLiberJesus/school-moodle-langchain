import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { MoodleMcpClient } from "../../lib/moodle-mcp-client.js";

// 1. Defina o schema Zod
const getResourceFileContentToolSchema = z.object({
  /* moodle_token: z
    .string()
    .describe("O token de autenticação do utilizador Moodle."), */
  resource_file_url: z
    .string()
    .describe("URL direta para o conteúdo do ficheiro 'resource' do Moodle."),
  mimetype: z
    .string()
    .describe('O MIME type do ficheiro (ex: "application/pdf", "text/plain").'),
});

// 2. Tipo do input
type GetResourceFileContentToolInput = z.infer<
  typeof getResourceFileContentToolSchema
>;

export class GetResourceFileContentTool extends StructuredTool<
  typeof getResourceFileContentToolSchema
> {
  name = "get_resource_file_content";
  description =
    'Recupera e extrai o texto de um ficheiro "resource" do Moodle (PDF, DOCX, TXT), dado o URL direto e o mimetype.';
  schema = getResourceFileContentToolSchema;
  moodleClient: MoodleMcpClient;

  constructor(moodleClient: MoodleMcpClient) {
    super();
    this.moodleClient = moodleClient;
  }

  async _call(
    args: GetResourceFileContentToolInput,
    config?: Record<string, any>
  ): Promise<string> {
    const moodleToken =
      config?.configurable?.moodle_user_token ||
      config?.metadata?.moodle_user_token;
    if (!moodleToken) {
      return "Erro: Token do utilizador não fornecido para a ferramenta.";
    }

    try {
      new URL(args.resource_file_url);
    } catch (e) {
      return "Erro: O resource_file_url fornecido não é um URL válido.";
    }

    const mcpServerInput: {
      moodle_token: string;
      resource_file_url: string;
      mimetype: string;
    } = {
      moodle_token: moodleToken,
      resource_file_url: args.resource_file_url,
      mimetype: args.mimetype,
    };

    console.log(
      `[GetResourceFileContentTool] Calling MCP tool '${
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
      return `Erro na ferramenta ${this.name}: ${errorMessage}`;
    }
  }
}
