import { z } from "zod";
import { StructuredTool } from "@langchain/core/tools";
import { MoodleMcpClient } from "../../lib/moodle-mcp-client.js";

export class GetMoodleCoursesTool extends StructuredTool {
  name = "get_courses";
  description =
    "Retrieves a list of Moodle courses. Optionally filters by course name.";

  schema = z
    .object({
      input: z
        .string()
        .optional()
        .nullable()
        .describe("Text to filter course names by."),
    })
    .transform((val) => val.input);

  private moodleClient: MoodleMcpClient;

  constructor(moodleClient: MoodleMcpClient) {
    super();
    this.moodleClient = moodleClient;
  }

  async _call(args: string | undefined): Promise<string> {
    const mcpServerInput: { course_name_filter?: string } = {};
    if (typeof args === "string" && args.trim() !== "") {
      mcpServerInput.course_name_filter = args;
    }
    try {
      const resultString = await this.moodleClient.callMcpTool(
        this.name,
        mcpServerInput
      );
      return resultString;
    } catch (error: any) {
      return `Error in tool ${this.name}: ${
        error.message || JSON.stringify(error)
      }`;
    }
  }
}
