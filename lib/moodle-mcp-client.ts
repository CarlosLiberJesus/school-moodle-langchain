import http from "http";
import { Buffer } from "buffer";

export class MoodleMcpClient {
  private readonly mcpServerUrlBase: string;
  private readonly moodleToken: string;
  private readonly courseId?: number;
  private rpcId: number = 1;

  constructor(
    mcpServerUrlBase: string,
    moodleToken: string,
    courseId?: number
  ) {
    this.mcpServerUrlBase = mcpServerUrlBase;
    this.moodleToken = moodleToken;
    this.courseId = courseId;
    if (!moodleToken) {
      console.warn(
        `[MyMoodleMcpClient] Warning: Moodle token was not provided at initialization.`
      );
    }
    console.log(
      `[MyMoodleMcpClient] Initialized for HTTP communication with MCP server at: ${
        this.mcpServerUrlBase
      }${courseId ? ` with course_id: ${courseId}` : ""}`
    );
  }

  public async callMcpTool(toolName: string, input: any): Promise<string> {
    const paramsWithToken = {
      moodle_token: this.moodleToken,
      ...input,
    };

    // Se courseId está definido e o input não tem course_id, injeta automaticamente
    if (this.courseId && !input.course_id) {
      paramsWithToken.course_id = this.courseId;
    }

    const payload = JSON.stringify({
      jsonrpc: "2.0",
      id: this.rpcId++,
      method: toolName,
      params: paramsWithToken,
    });

    const [url, port] = this.mcpServerUrlBase.split(":");
    const options = {
      hostname: url,
      port: port,
      path: "/mcp",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "User-Agent": "Node.js HTTP Client",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    console.log(
      `[MyMoodleMcpClient] Calling MCP tool via HTTP POST: ${toolName} with input (token injected):`,
      input
    );

    // Log the exact payload being sent
    console.log(
      `[MyMoodleMcpClient] Sending header: ${JSON.stringify(options)}`
    );
    console.log(`[MyMoodleMcpClient] Sending payload: ${payload}`);

    return new Promise<string>((resolve, reject) => {
      const req = http.request(options, (res) => {
        req.setTimeout(30000, () => {
          req.destroy(
            new Error(
              `[MyMoodleMcpClient] Request to MCP tool ${toolName} timed out after 30 seconds`
            )
          );
        });
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              console.log(
                `[MyMoodleMcpClient] Raw response from MCP server: ${data}`
              );
              const response = JSON.parse(data);
              console.log(
                `[MyMoodleMcpClient] Parsed response from MCP tool ${toolName}:`,
                response
              );
              if (
                response.result &&
                response.result.content &&
                response.result.content[0] &&
                response.result.content[0].type === "text"
              ) {
                resolve(response.result.content[0].text);
              } else if (response.result) {
                if (typeof response.result === "string") {
                  resolve(response.result);
                } else {
                  resolve(JSON.stringify(response.result));
                }
              } else if (response.error) {
                console.error(
                  `[MyMoodleMcpClient] JSON-RPC Error from ${toolName}: ${JSON.stringify(
                    response.error
                  )}`
                );
                reject(
                  new Error(
                    `Error from ${toolName}: ${
                      response.error.message || JSON.stringify(response.error)
                    }`
                  )
                );
              } else {
                reject(
                  new Error(
                    `[MyMoodleMcpClient] Unexpected response format from MCP tool ${toolName}. Response: ${JSON.stringify(
                      response
                    )}`
                  )
                );
              }
            } catch (e: any) {
              reject(
                new Error(
                  `[MyMoodleMcpClient] Error parsing JSON response: ${e.message}. Raw data: ${data}`
                )
              );
            }
          } else {
            console.error(
              `[MyMoodleMcpClient] HTTP error! status: ${res.statusCode} for tool ${toolName}. Response data: ${data}`
            );
            reject(
              new Error(
                `[MyMoodleMcpClient] HTTP error! status: ${res.statusCode} while calling ${toolName}. Check logs for full response.`
              )
            );
          }
        });
      });

      req.on("error", (e) => {
        console.error(
          `[MyMoodleMcpClient] Network or request error for MCP tool ${toolName}:`,
          e
        );
        reject(
          new Error(
            `[MyMoodleMcpClient] Network or request error calling ${toolName}: ${e.message}`
          )
        );
      });

      req.write(payload);
      req.end();
    });
  }

  public shutdown() {
    console.log(
      "[MyMoodleMcpClient] Shutdown for HTTP client (no action needed)."
    );
  }
}
