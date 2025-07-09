#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { SandboxManager } from "./sandbox-manager.js";
import { ComputerUseTools } from "./computer-use-tools.js";
import { z } from "zod";

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    e2bApiKey: null as string | null,
    openaiApiKey: null as string | null,
    anthropicApiKey: null as string | null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    // Handle --key=value format
    if (arg.startsWith('--e2b-api-key=') || arg.startsWith('--e2b-key=')) {
      config.e2bApiKey = arg.split('=')[1];
      continue;
    }
    if (arg.startsWith('--openai-api-key=') || arg.startsWith('--openai-key=')) {
      config.openaiApiKey = arg.split('=')[1];
      continue;
    }
    if (arg.startsWith('--anthropic-api-key=') || arg.startsWith('--anthropic-key=')) {
      config.anthropicApiKey = arg.split('=')[1];
      continue;
    }

    // Handle --key value format
    switch (arg) {
      case '--e2b-api-key':
      case '--e2b-key':
        if (nextArg && !nextArg.startsWith('--')) {
          config.e2bApiKey = nextArg;
          i++; // Skip the next argument as it's the value
        }
        break;
      case '--openai-api-key':
      case '--openai-key':
        if (nextArg && !nextArg.startsWith('--')) {
          config.openaiApiKey = nextArg;
          i++; // Skip the next argument as it's the value
        }
        break;
      case '--anthropic-api-key':
      case '--anthropic-key':
        if (nextArg && !nextArg.startsWith('--')) {
          config.anthropicApiKey = nextArg;
          i++; // Skip the next argument as it's the value
        }
        break;
      case '--help':
      case '-h':
        console.error(`
E2B Computer Use MCP Server

Usage: node dist/index.js [options]

Options:
  --e2b-api-key <key>        E2B API key (required)
  --e2b-api-key=<key>        E2B API key (required, alternative format)
  --openai-api-key <key>     OpenAI API key (optional)
  --anthropic-api-key <key>  Anthropic API key (optional)
  --help, -h                 Show this help message

Examples:
  node dist/index.js --e2b-api-key "your_e2b_key_here"
  node dist/index.js --e2b-api-key=your_e2b_key_here

Get your E2B API key from: https://e2b.dev/docs/quickstart/api-key
        `);
        process.exit(0);
        break;
    }
  }

  // Fallback to environment variables if not provided as arguments
  config.e2bApiKey = config.e2bApiKey || process.env.E2B_API_KEY || null;
  config.openaiApiKey = config.openaiApiKey || process.env.OPENAI_API_KEY || null;
  config.anthropicApiKey = config.anthropicApiKey || process.env.ANTHROPIC_API_KEY || null;

  return config;
}

// Validation schemas
const CreateSandboxSchema = z.object({
  resolution: z.tuple([z.number(), z.number()]).optional(),
  timeout: z.number().optional(),
});

const ExecuteActionSchema = z.object({
  sandboxId: z.string(),
  action: z.object({
    type: z.enum(["click", "double_click", "type", "keypress", "move", "scroll", "drag", "screenshot"]),
    x: z.number().optional(),
    y: z.number().optional(),
    text: z.string().optional(),
    keys: z.string().optional(),
    button: z.enum(["left", "right", "middle"]).optional(),
    scroll_x: z.number().optional(),
    scroll_y: z.number().optional(),
    path: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
  }),
});

const GetStreamUrlSchema = z.object({
  sandboxId: z.string(),
});

const CleanupSandboxSchema = z.object({
  sandboxId: z.string(),
});

class E2BComputerUseMCPServer {
  private server: Server;
  private sandboxManager: SandboxManager;
  private computerUseTools: ComputerUseTools;
  private config: ReturnType<typeof parseArgs>;

  constructor(config: ReturnType<typeof parseArgs>) {
    this.config = config;
    
    this.server = new Server(
      {
        name: "e2b-computer-use-mcp",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.sandboxManager = new SandboxManager(config.e2bApiKey);
    this.computerUseTools = new ComputerUseTools(this.sandboxManager);
    this.setupHandlers();
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "create_sandbox",
            description: "Create a new E2B desktop sandbox instance",
            inputSchema: {
              type: "object",
              properties: {
                resolution: {
                  type: "array",
                  items: { type: "number" },
                  minItems: 2,
                  maxItems: 2,
                  description: "Screen resolution [width, height]",
                },
                timeout: {
                  type: "number",
                  description: "Timeout in milliseconds",
                },
              },
            },
          },
          {
            name: "execute_computer_action",
            description: "Execute a computer action on the sandbox",
            inputSchema: {
              type: "object",
              properties: {
                sandboxId: {
                  type: "string",
                  description: "Sandbox ID to execute action on",
                },
                action: {
                  type: "object",
                  properties: {
                    type: {
                      type: "string",
                      enum: ["click", "double_click", "type", "keypress", "move", "scroll", "drag", "screenshot"],
                      description: "Type of action to execute",
                    },
                    x: { type: "number", description: "X coordinate" },
                    y: { type: "number", description: "Y coordinate" },
                    text: { type: "string", description: "Text to type" },
                    keys: { type: "string", description: "Keys to press" },
                    button: {
                      type: "string",
                      enum: ["left", "right", "middle"],
                      description: "Mouse button",
                    },
                    scroll_x: { type: "number", description: "Horizontal scroll amount" },
                    scroll_y: { type: "number", description: "Vertical scroll amount" },
                    path: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          x: { type: "number" },
                          y: { type: "number" },
                        },
                      },
                      description: "Path for drag action",
                    },
                  },
                  required: ["type"],
                },
              },
              required: ["sandboxId", "action"],
            },
          },
          {
            name: "get_stream_url",
            description: "Get the VNC stream URL for a sandbox",
            inputSchema: {
              type: "object",
              properties: {
                sandboxId: {
                  type: "string",
                  description: "Sandbox ID to get stream URL for",
                },
              },
              required: ["sandboxId"],
            },
          },
          {
            name: "get_screenshot",
            description: "Take a screenshot of the sandbox desktop",
            inputSchema: {
              type: "object",
              properties: {
                sandboxId: {
                  type: "string",
                  description: "Sandbox ID to take screenshot of",
                },
              },
              required: ["sandboxId"],
            },
          },
          {
            name: "cleanup_sandbox",
            description: "Clean up and destroy a sandbox instance",
            inputSchema: {
              type: "object",
              properties: {
                sandboxId: {
                  type: "string",
                  description: "Sandbox ID to clean up",
                },
              },
              required: ["sandboxId"],
            },
          },
          {
            name: "list_sandboxes",
            description: "List all active sandbox instances",
            inputSchema: {
              type: "object",
              properties: {},
            },
          },
        ] as Tool[],
      };
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "create_sandbox": {
            const parsed = CreateSandboxSchema.parse(args);
            const result = await this.sandboxManager.createSandbox(
              parsed.resolution,
              parsed.timeout
            );
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case "execute_computer_action": {
            const parsed = ExecuteActionSchema.parse(args);
            const result = await this.computerUseTools.executeAction(
              parsed.sandboxId,
              parsed.action
            );
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case "get_stream_url": {
            const parsed = GetStreamUrlSchema.parse(args);
            const result = await this.sandboxManager.getStreamUrl(parsed.sandboxId);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ streamUrl: result }, null, 2),
                },
              ],
            };
          }

          case "get_screenshot": {
            const parsed = GetStreamUrlSchema.parse(args); // Same schema
            const result = await this.computerUseTools.takeScreenshot(parsed.sandboxId);
            return {
              content: [
                {
                  type: "image",
                  data: result.base64,
                  mimeType: "image/png",
                },
              ],
            };
          }

          case "cleanup_sandbox": {
            const parsed = CleanupSandboxSchema.parse(args);
            const result = await this.sandboxManager.cleanupSandbox(parsed.sandboxId);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ success: result }, null, 2),
                },
              ],
            };
          }

          case "list_sandboxes": {
            const result = await this.sandboxManager.listSandboxes();
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error executing tool ${name}: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("E2B Computer Use MCP Server running on stdio");
    console.error(`E2B API Key: ${this.config.e2bApiKey ? '✓ Provided' : '✗ Missing'}`);
    if (this.config.e2bApiKey) {
      console.error(`API Key Preview: ${this.config.e2bApiKey.substring(0, 10)}...`);
    }
  }
}

// Main execution
const config = parseArgs();

if (!config.e2bApiKey) {
  console.error("❌ E2B API key is required!");
  console.error("Use: node dist/index.js --e2b-api-key your_key_here");
  console.error("Or: node dist/index.js --e2b-api-key=your_key_here");
  console.error("Or set E2B_API_KEY environment variable");
  console.error("Get your API key from: https://e2b.dev/docs/quickstart/api-key");
  process.exit(1);
}

const server = new E2BComputerUseMCPServer(config);
server.run().catch(console.error); 