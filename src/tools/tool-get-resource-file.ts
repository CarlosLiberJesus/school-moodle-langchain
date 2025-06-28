import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { MoodleMcpClient } from "../../lib/moodle-mcp-client.js";

// 1. Defina o schema Zod
// moodle_token is removed as it's handled by MoodleMcpClient
const getResourceFileContentToolSchema = z.object({
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
    config?: Record<string, any> // config is kept for Langchain compatibility but not used for token
  ): Promise<string> {
    // moodle_token is no longer sourced from config. MoodleMcpClient handles it.

    try {
      // Basic URL validation
      new URL(args.resource_file_url);
    } catch (e) {
      return "Erro: O resource_file_url fornecido não é um URL válido.";
    }

    // mcpServerInput will not include moodle_token here.
    const mcpServerInput: {
      resource_file_url: string;
      mimetype: string;
    } = {
      resource_file_url: args.resource_file_url,
      mimetype: args.mimetype,
    };

    console.log(
      `[GetResourceFileContentTool] Calling MCP tool '${
        this.name
      }' with input: ${JSON.stringify(mcpServerInput)} (token will be injected by client)`
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
      console.error(`[GetResourceFileContentTool] Error in tool ${this.name}:`, error);
      return `Erro na ferramenta ${this.name}: ${errorMessage}`;
    }
  }
}
