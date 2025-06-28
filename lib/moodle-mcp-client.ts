import http from "http";
import { Buffer } from "buffer";
// import { CallToolRequest } from "@modelcontextprotocol/sdk/types.js"; // Not strictly needed for HTTP

// --- INÍCIO DO CÓDIGO DO McpClientManager (simplificado e integrado aqui por agora) ---
// Idealmente, isto estaria num ficheiro separado, e.g., 'mcp-client.ts'
export class MoodleMcpClient {
  private readonly mcpServerUrlBase: string;
  private readonly moodleToken: string; // Store Moodle token
  private rpcId: number = 1; // For unique JSON-RPC request IDs

  constructor(mcpServerUrlBase: string, moodleToken: string) { // Accept moodleToken in constructor
    this.mcpServerUrlBase = mcpServerUrlBase;
    this.moodleToken = moodleToken; // Store it
    if (!moodleToken) {
      console.warn(
        `[MyMoodleMcpClient] Warning: Moodle token was not provided at initialization.`
      );
    }
    console.log(
      `[MyMoodleMcpClient] Initialized for HTTP communication with MCP server at: ${this.mcpServerUrlBase}`
    );
  }

  public async callMcpTool(toolName: string, input: any): Promise<string> {
    // Combine the stored Moodle token with other input parameters
    const paramsWithToken = {
      moodle_token: this.moodleToken,
      ...input,
    };

    const payload = JSON.stringify({
      jsonrpc: "2.0",
      id: this.rpcId++,
      method: toolName,
      params: paramsWithToken, // Use combined params
    });

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
        "Accept": "application/json, text/event-stream",
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    // Log the input without the token for brevity, or consider logging the token partially for debugging if necessary
    console.log(
      `[MyMoodleMcpClient] Calling MCP tool via HTTP POST: ${toolName} with input (token injected):`,
      input // Log original input, token is injected into paramsWithToken
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
              if (response.result && response.result.content && response.result.content[0] && response.result.content[0].type === 'text') {
                resolve(response.result.content[0].text);
              } else if (response.result) {
                if (typeof response.result === 'string') {
                    resolve(response.result);
                } else {
                    resolve(JSON.stringify(response.result));
                }
              } else if (response.error) { // Handle JSON-RPC errors
                console.error(`[MyMoodleMcpClient] JSON-RPC Error from ${toolName}: ${JSON.stringify(response.error)}`);
                reject(new Error(`Error from ${toolName}: ${response.error.message || JSON.stringify(response.error)}`));
              }
              else {
                reject(
                  new Error(
                    `[MyMoodleMcpClient] Unexpected response format from MCP tool ${toolName}. Response: ${JSON.stringify(response)}`
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
    // No persistent connections to shut down for HTTP, so this can be empty.
    // Potentially, could be used for cleanup if any resources were allocated.
    console.log(
      "[MyMoodleMcpClient] Shutdown for HTTP client (no action needed)."
    );
  }
}
