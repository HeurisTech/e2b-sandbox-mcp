/**
 * Example client integration for E2B Computer Use MCP Server
 * This shows how to integrate the MCP server into your larger project
 */

import { MCPClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "child_process";

export interface DesktopSession {
  sandboxId: string;
  streamUrl: string;
  resolution: [number, number];
  createdAt: Date;
}

export interface ComputerAction {
  type: "click" | "double_click" | "type" | "keypress" | "move" | "scroll" | "drag";
  x?: number;
  y?: number;
  text?: string;
  keys?: string;
  button?: "left" | "right" | "middle";
  scroll_y?: number;
  path?: Array<{ x: number; y: number }>;
}

export class E2BComputerUseClient {
  private mcpClient: MCPClient;
  private mcpTransport: StdioClientTransport;
  private activeSessions = new Map<string, DesktopSession>();

  constructor() {
    this.mcpClient = new MCPClient(
      { name: "e2b-client", version: "1.0.0" },
      { capabilities: {} }
    );
  }

  async initialize(): Promise<void> {
    // Spawn the MCP server process
    const serverProcess = spawn("node", ["dist/index.js"], {
      cwd: process.cwd(), // Adjust path to your MCP server
      stdio: ["pipe", "pipe", "inherit"],
      env: {
        ...process.env,
        E2B_API_KEY: process.env.E2B_API_KEY,
      },
    });

    // Create transport and connect
    this.mcpTransport = new StdioClientTransport({
      stdin: serverProcess.stdin!,
      stdout: serverProcess.stdout!,
    });

    await this.mcpClient.connect(this.mcpTransport);
    console.log("Connected to E2B Computer Use MCP Server");
  }

  async createDesktopSession(
    resolution: [number, number] = [1920, 1080],
    timeout: number = 600000
  ): Promise<DesktopSession> {
    try {
      const result = await this.mcpClient.request(
        {
          method: "tools/call",
          params: {
            name: "create_sandbox",
            arguments: {
              resolution,
              timeout,
            },
          },
        },
        { timeout: 30000 }
      );

      const response = JSON.parse(result.content[0].text);
      
      if (response.status !== "created") {
        throw new Error(`Failed to create sandbox: ${response.message}`);
      }

      const session: DesktopSession = {
        sandboxId: response.sandboxId,
        streamUrl: response.streamUrl,
        resolution: response.resolution,
        createdAt: new Date(),
      };

      this.activeSessions.set(session.sandboxId, session);
      
      console.log(`Created desktop session: ${session.sandboxId}`);
      console.log(`Stream URL: ${session.streamUrl}`);
      
      return session;
    } catch (error) {
      console.error("Failed to create desktop session:", error);
      throw error;
    }
  }

  async executeAction(sandboxId: string, action: ComputerAction): Promise<any> {
    try {
      const result = await this.mcpClient.request({
        method: "tools/call",
        params: {
          name: "execute_computer_action",
          arguments: {
            sandboxId,
            action,
          },
        },
      });

      const response = JSON.parse(result.content[0].text);
      
      if (!response.success) {
        throw new Error(`Action failed: ${response.message}`);
      }

      return response;
    } catch (error) {
      console.error(`Failed to execute action ${action.type}:`, error);
      throw error;
    }
  }

  async takeScreenshot(sandboxId: string): Promise<{
    base64: string;
    format: string;
    width: number;
    height: number;
  }> {
    try {
      const result = await this.mcpClient.request({
        method: "tools/call",
        params: {
          name: "get_screenshot",
          arguments: { sandboxId },
        },
      });

      // Screenshot is returned as image content
      const imageContent = result.content.find(c => c.type === "image");
      if (!imageContent) {
        throw new Error("No image content in screenshot response");
      }

      return {
        base64: imageContent.data,
        format: "png",
        width: 0, // Would need to parse from response
        height: 0, // Would need to parse from response
      };
    } catch (error) {
      console.error("Failed to take screenshot:", error);
      throw error;
    }
  }

  async getStreamUrl(sandboxId: string): Promise<string> {
    // Check local cache first
    const session = this.activeSessions.get(sandboxId);
    if (session && session.streamUrl) {
      return session.streamUrl;
    }

    try {
      const result = await this.mcpClient.request({
        method: "tools/call",
        params: {
          name: "get_stream_url",
          arguments: { sandboxId },
        },
      });

      const response = JSON.parse(result.content[0].text);
      return response.streamUrl;
    } catch (error) {
      console.error("Failed to get stream URL:", error);
      throw error;
    }
  }

  async cleanupSession(sandboxId: string): Promise<boolean> {
    try {
      const result = await this.mcpClient.request({
        method: "tools/call",
        params: {
          name: "cleanup_sandbox",
          arguments: { sandboxId },
        },
      });

      const response = JSON.parse(result.content[0].text);
      
      if (response.success) {
        this.activeSessions.delete(sandboxId);
        console.log(`Cleaned up session: ${sandboxId}`);
      }

      return response.success;
    } catch (error) {
      console.error("Failed to cleanup session:", error);
      return false;
    }
  }

  async listActiveSessions(): Promise<DesktopSession[]> {
    try {
      const result = await this.mcpClient.request({
        method: "tools/call",
        params: {
          name: "list_sandboxes",
          arguments: {},
        },
      });

      const response = JSON.parse(result.content[0].text);
      return response.active;
    } catch (error) {
      console.error("Failed to list sessions:", error);
      return [];
    }
  }

  // High-level convenience methods
  async openBrowser(sandboxId: string, url?: string): Promise<void> {
    // Click on Firefox icon (assuming it's in taskbar)
    await this.executeAction(sandboxId, {
      type: "keypress",
      keys: "Meta+t", // New tab shortcut
    });

    if (url) {
      await this.executeAction(sandboxId, {
        type: "type",
        text: url,
      });

      await this.executeAction(sandboxId, {
        type: "keypress",
        keys: "Return",
      });
    }
  }

  async openTerminal(sandboxId: string): Promise<void> {
    await this.executeAction(sandboxId, {
      type: "keypress",
      keys: "Ctrl+Alt+t",
    });
  }

  async runCommand(sandboxId: string, command: string): Promise<void> {
    await this.executeAction(sandboxId, {
      type: "type",
      text: command,
    });

    await this.executeAction(sandboxId, {
      type: "keypress",
      keys: "Return",
    });
  }

  async openFileManager(sandboxId: string): Promise<void> {
    await this.executeAction(sandboxId, {
      type: "keypress",
      keys: "Meta+f",
    });
  }

  // Cleanup all sessions
  async shutdown(): Promise<void> {
    console.log("Shutting down E2B client...");
    
    const cleanupPromises = Array.from(this.activeSessions.keys()).map(
      sandboxId => this.cleanupSession(sandboxId)
    );
    
    await Promise.allSettled(cleanupPromises);
    await this.mcpClient.close();
    
    console.log("E2B client shut down complete");
  }
}

// Example usage in your larger application
export class YourMainApplication {
  private computerUseClient: E2BComputerUseClient;

  constructor() {
    this.computerUseClient = new E2BComputerUseClient();
  }

  async initialize(): Promise<void> {
    await this.computerUseClient.initialize();
  }

  async handleUserRequest(instruction: string): Promise<{
    sandboxId: string;
    streamUrl: string;
    result: string;
  }> {
    // Create a new desktop session
    const session = await this.computerUseClient.createDesktopSession();

    try {
      // Process the instruction and execute computer actions
      await this.processInstruction(session.sandboxId, instruction);

      return {
        sandboxId: session.sandboxId,
        streamUrl: session.streamUrl,
        result: "Task completed successfully",
      };
    } catch (error) {
      // Cleanup on error
      await this.computerUseClient.cleanupSession(session.sandboxId);
      throw error;
    }
  }

  private async processInstruction(sandboxId: string, instruction: string): Promise<void> {
    // Example: Simple instruction processing
    if (instruction.includes("open browser")) {
      await this.computerUseClient.openBrowser(sandboxId);
    }
    
    if (instruction.includes("search for")) {
      const searchTerm = instruction.replace("search for", "").trim();
      await this.computerUseClient.openBrowser(sandboxId, `https://google.com/search?q=${encodeURIComponent(searchTerm)}`);
    }
    
    if (instruction.includes("open terminal")) {
      await this.computerUseClient.openTerminal(sandboxId);
    }

    if (instruction.includes("run command")) {
      const command = instruction.replace("run command", "").trim();
      await this.computerUseClient.openTerminal(sandboxId);
      // Wait a moment for terminal to open
      await new Promise(resolve => setTimeout(resolve, 2000));
      await this.computerUseClient.runCommand(sandboxId, command);
    }

    // For more complex instructions, you would integrate with AI here
    // const actions = await this.generateActionsWithAI(instruction, screenshot);
    // for (const action of actions) {
    //   await this.computerUseClient.executeAction(sandboxId, action);
    // }
  }

  async shutdown(): Promise<void> {
    await this.computerUseClient.shutdown();
  }
}

// Example usage
if (require.main === module) {
  async function example() {
    const app = new YourMainApplication();
    
    try {
      await app.initialize();
      
      const result = await app.handleUserRequest("open browser and search for TypeScript tutorials");
      
      console.log("Task completed!");
      console.log("Sandbox ID:", result.sandboxId);
      console.log("Stream URL:", result.streamUrl);
      
      // Keep session alive for manual inspection
      console.log("Session will remain active. Press Ctrl+C to cleanup and exit.");
      
      process.on("SIGINT", async () => {
        await app.shutdown();
        process.exit(0);
      });
      
    } catch (error) {
      console.error("Error:", error);
      await app.shutdown();
    }
  }

  example();
} 