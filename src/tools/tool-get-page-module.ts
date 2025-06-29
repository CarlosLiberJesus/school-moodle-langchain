import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { MoodleMcpClient } from "../../lib/moodle-mcp-client.js";

// 1. Defina o schema Zod
// moodle_token is removed as it's handled by MoodleMcpClient
const getPageModuleContentToolSchema = z.object({
  page_content_url: z
    .string()
    .describe("URL direta para o conteúdo do módulo 'Page' do Moodle."),
  // .url() // Zod's .url() can be strict, consider if simple string is enough
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

  async _call(args: GetPageModuleContentToolInput): Promise<string> {
    // moodle_token is no longer sourced from config. MoodleMcpClient handles it.

    try {
      // Basic URL validation, can be enhanced if needed
      new URL(args.page_content_url);
    } catch {
      return "Erro: O page_content_url fornecido não é um URL válido.";
    }

    // mcpServerInput will not include moodle_token here.
    const mcpServerInput: {
      page_content_url: string;
    } = {
      page_content_url: args.page_content_url,
    };

    console.log(
      `[GetPageModuleContentTool] Calling MCP tool '${
        this.name
      }' with input: ${JSON.stringify(
        mcpServerInput
      )} (token will be injected by client)`
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
        `[GetPageModuleContentTool] Error in tool ${this.name}:`,
        error
      );
      return `Erro na ferramenta ${this.name}: ${errorMessage}`;
    }
  }
}
