import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { Request, Response, NextFunction } from "express";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { SandboxManager } from "./sandbox-manager.js";
import { ComputerUseTools } from "./computer-use-tools.js";
import { CodeSandboxManager } from "./code-tools.js";

const MCP_API_TOKEN = process.env.MCP_API_TOKEN;
const E2B_API_KEY = process.env.E2B_API_KEY || null;

// Shared instances (stateless transport, but we keep sandbox state in memory)
const sandboxManager = new SandboxManager(E2B_API_KEY);
const computerUseTools = new ComputerUseTools(sandboxManager);
const codeSandboxManager = new CodeSandboxManager(E2B_API_KEY);

export function createServer(): McpServer {
  const server = new McpServer(
    { name: "e2b-sandbox-mcp", version: "1.2.0" },
    { capabilities: { logging: {} } },
  );

  // ========== DESKTOP TOOLS (existing) ==========

  server.registerTool(
    "create_sandbox",
    {
      description: "Create a new E2B desktop sandbox instance (GUI + VNC)",
      inputSchema: {
        resolution: z
          .tuple([z.number(), z.number()])
          .optional()
          .describe("Screen resolution [width, height]"),
        timeout: z.number().optional().describe("Timeout in milliseconds"),
      },
    },
    async ({ resolution, timeout }) => {
      const result = await sandboxManager.createSandbox(resolution, timeout);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    "execute_computer_action",
    {
      description: "Execute a computer action on the desktop sandbox",
      inputSchema: {
        sandboxId: z.string().describe("Sandbox ID to execute action on"),
        action: z.object({
          type: z.enum([
            "click",
            "double_click",
            "type",
            "keypress",
            "move",
            "scroll",
            "drag",
            "screenshot",
          ]),
          x: z.number().optional(),
          y: z.number().optional(),
          text: z.string().optional(),
          keys: z.string().optional(),
          button: z.enum(["left", "right", "middle"]).optional(),
          scroll_x: z.number().optional(),
          scroll_y: z.number().optional(),
          path: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
        }),
      },
    },
    async ({ sandboxId, action }) => {
      const result = await computerUseTools.executeAction(sandboxId, action);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    "get_stream_url",
    {
      description: "Get the VNC stream URL for a desktop sandbox",
      inputSchema: {
        sandboxId: z.string().describe("Sandbox ID to get stream URL for"),
      },
    },
    async ({ sandboxId }) => {
      const result = await sandboxManager.getStreamUrl(sandboxId);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ streamUrl: result }, null, 2),
          },
        ],
      };
    },
  );

  server.registerTool(
    "get_screenshot",
    {
      description: "Take a screenshot of the desktop sandbox",
      inputSchema: {
        sandboxId: z.string().describe("Sandbox ID to take screenshot of"),
      },
    },
    async ({ sandboxId }) => {
      const result = await computerUseTools.takeScreenshot(sandboxId);
      return {
        content: [
          {
            type: "image",
            data: result.base64,
            mimeType: "image/png",
          },
        ],
      };
    },
  );

  server.registerTool(
    "cleanup_sandbox",
    {
      description: "Clean up and destroy a desktop sandbox instance",
      inputSchema: {
        sandboxId: z.string().describe("Sandbox ID to clean up"),
      },
    },
    async ({ sandboxId }) => {
      const result = await sandboxManager.cleanupSandbox(sandboxId);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: result }, null, 2),
          },
        ],
      };
    },
  );

  server.registerTool(
    "list_sandboxes",
    {
      description: "List all active desktop sandbox instances",
      inputSchema: {},
    },
    async () => {
      const result = await sandboxManager.listSandboxes();
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  // ========== CODE INTERPRETER TOOLS (new - for weight-space programming) ==========

  server.registerTool(
    "create_code_sandbox",
    {
      description:
        "Create a new E2B code interpreter sandbox (Python, file system, packages). Use this for loading/editing neural network weights, running ML code, weight-space programming.",
      inputSchema: {
        timeout: z
          .number()
          .optional()
          .describe("Timeout in milliseconds (default 10 minutes)"),
      },
    },
    async ({ timeout }) => {
      const result = await codeSandboxManager.createCodeSandbox(timeout);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    "run_code",
    {
      description:
        "Execute code inside a code sandbox. Defaults to Python. Perfect for loading models, inspecting tensors, modifying weights, etc.",
      inputSchema: {
        sandboxId: z.string().describe("Code sandbox ID"),
        code: z.string().describe("Code to execute"),
        language: z
          .enum(["python", "javascript", "bash"])
          .optional()
          .describe("Language (default: python)"),
      },
    },
    async ({ sandboxId, code, language }) => {
      const result = await codeSandboxManager.runCode(
        sandboxId,
        code,
        language || "python",
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    "write_file",
    {
      description: "Write a file inside a code sandbox",
      inputSchema: {
        sandboxId: z.string().describe("Code sandbox ID"),
        path: z.string().describe("Absolute path inside the sandbox"),
        content: z.string().describe("File content"),
      },
    },
    async ({ sandboxId, path, content }) => {
      const result = await codeSandboxManager.writeFile(sandboxId, path, content);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    "read_file",
    {
      description: "Read a file from a code sandbox",
      inputSchema: {
        sandboxId: z.string().describe("Code sandbox ID"),
        path: z.string().describe("Absolute path inside the sandbox"),
      },
    },
    async ({ sandboxId, path }) => {
      const result = await codeSandboxManager.readFile(sandboxId, path);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    "list_files",
    {
      description: "List files/directories inside a code sandbox",
      inputSchema: {
        sandboxId: z.string().describe("Code sandbox ID"),
        path: z
          .string()
          .optional()
          .describe("Directory path (default: /home/user)"),
      },
    },
    async ({ sandboxId, path }) => {
      const result = await codeSandboxManager.listFiles(
        sandboxId,
        path || "/home/user",
      );
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  server.registerTool(
    "cleanup_code_sandbox",
    {
      description: "Destroy a code sandbox",
      inputSchema: {
        sandboxId: z.string().describe("Code sandbox ID to clean up"),
      },
    },
    async ({ sandboxId }) => {
      const result = await codeSandboxManager.cleanup(sandboxId);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ success: result }, null, 2),
          },
        ],
      };
    },
  );

  server.registerTool(
    "list_code_sandboxes",
    {
      description: "List all active code sandboxes",
      inputSchema: {},
    },
    async () => {
      const result = codeSandboxManager.list();
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    },
  );

  return server;
}

const RENDER_EXTERNAL_HOSTNAME = process.env.RENDER_EXTERNAL_HOSTNAME;

export const app = createMcpExpressApp({
  host: "0.0.0.0",
  allowedHosts: RENDER_EXTERNAL_HOSTNAME ? [RENDER_EXTERNAL_HOSTNAME] : undefined,
});

// Optional bearer token auth (set MCP_API_TOKEN on Render)
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path === "/health" || !MCP_API_TOKEN) {
    next();
    return;
  }

  const auth = req.headers.authorization ?? "";
  const expected = `Bearer ${MCP_API_TOKEN}`;
  if (
    auth.length === expected.length &&
    timingSafeEqual(Buffer.from(auth), Buffer.from(expected))
  ) {
    next();
    return;
  }

  res.status(401).json({
    jsonrpc: "2.0",
    error: { code: -32001, message: "Unauthorized" },
    id: null,
  });
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    e2bConfigured: !!E2B_API_KEY,
    version: "1.2.0",
    features: ["desktop", "code-interpreter"],
    timestamp: new Date().toISOString(),
  });
});

app.post("/mcp", async (req: Request, res: Response) => {
  if (!E2B_API_KEY) {
    res.status(500).json({
      jsonrpc: "2.0",
      error: {
        code: -32603,
        message: "E2B_API_KEY is not configured on this server",
      },
      id: null,
    });
    return;
  }

  const server = createServer();
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on("close", () => {
      transport.close();
      server.close();
    });
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.get("/mcp", (_req: Request, res: Response) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed." },
    id: null,
  });
});

app.delete("/mcp", (_req: Request, res: Response) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed." },
    id: null,
  });
});
