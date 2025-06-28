import http from "http";
import { Buffer } from "buffer";
// import { CallToolRequest } from "@modelcontextprotocol/sdk/types.js"; // Not strictly needed for HTTP

// --- INÍCIO DO CÓDIGO DO McpClientManager (simplificado e integrado aqui por agora) ---
// Idealmente, isto estaria num ficheiro separado, e.g., 'mcp-client.ts'
export class MoodleMcpClient {
  private readonly mcpServerUrlBase: string;

  constructor(mcpServerUrlBase: string) {
    this.mcpServerUrlBase = mcpServerUrlBase;
    console.log(
      `[MyMoodleMcpClient] Initialized for HTTP communication with MCP server at: ${this.mcpServerUrlBase}`
    );
  }

  public async callMcpTool(toolName: string, input: any): Promise<string> {
    const payload = JSON.stringify({ name: toolName, input: input });

    const url = new URL(this.mcpServerUrlBase + "/mcp"); // Assuming /mcp is the fixed endpoint path
    const hostname = url.hostname;
    const port = url.port
      ? parseInt(url.port, 10)
      : url.protocol === "https:"
      ? 443
      : 80;
    const path = url.pathname; // This will be /mcp

    const options = {
      hostname: hostname,
      port: port,
      path: path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    console.log(
      `[MyMoodleMcpClient] Calling MCP tool via HTTP POST: ${toolName} with input:`,
      input
    );

    return new Promise<string>((resolve, reject) => {
      const req = http.request(options, (res) => {
        req.setTimeout(30000, () => {
          // 30 seconds timeout
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
                response.content &&
                response.content[0] &&
                response.content[0].type === "text"
              ) {
                resolve(response.content[0].text);
              } else {
                reject(
                  new Error(
                    `[MyMoodleMcpClient] Unexpected response format from MCP tool ${toolName}`
                  )
                );
              }
            } catch (e: any) {
              reject(
                new Error(
                  `[MyMoodleMcpClient] Error parsing JSON response: ${e.message}`
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
    // No persistent connections to shut down for HTTP, so this can be empty.
    // Potentially, could be used for cleanup if any resources were allocated.
    console.log(
      "[MyMoodleMcpClient] Shutdown for HTTP client (no action needed)."
    );
  }
}
