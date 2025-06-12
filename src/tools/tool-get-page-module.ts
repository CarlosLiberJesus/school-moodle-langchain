import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { MoodleMcpClient } from "../../lib/moodle-mcp-client.js";

// 1. Defina o schema Zod
const getPageModuleContentToolSchema = z.object({
  /* moodle_token: z
    .string()
    .describe("O token de autenticação do utilizador Moodle."), */
  page_content_url: z
    .string()
    .describe("URL direta para o conteúdo do módulo 'Page' do Moodle."),
  // .url()
});

// 2. Tipo do input
type GetPageModuleContentToolInput = z.infer<
  typeof getPageModuleContentToolSchema
>;

export class GetPageModuleContentTool extends StructuredTool<
  typeof getPageModuleContentToolSchema
> {
  name = "get_page_module_content";
  description =
    'Recupera o texto extraído do conteúdo de um módulo "Page" do Moodle, dado o URL direto do conteúdo.';
  schema = getPageModuleContentToolSchema;
  moodleClient: MoodleMcpClient;

  constructor(moodleClient: MoodleMcpClient) {
    super();
    this.moodleClient = moodleClient;
  }

  async _call(
    args: GetPageModuleContentToolInput,
    config?: Record<string, any>
  ): Promise<string> {
    const moodleToken =
      config?.configurable?.moodle_user_token ||
      config?.metadata?.moodle_user_token;

    if (!moodleToken) {
      return "Erro: Token do utilizador não fornecido para a ferramenta.";
    }
    try {
      new URL(args.page_content_url);
    } catch (e) {
      return "Erro: O page_content_url fornecido não é um URL válido.";
    }

    const mcpServerInput: {
      moodle_token: string;
      page_content_url: string;
    } = {
      moodle_token: moodleToken,
      page_content_url: args.page_content_url,
    };

    console.log(
      `[GetPageModuleContentTool] Calling MCP tool '${
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
