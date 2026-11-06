import "dotenv/config";
import { app } from "./app.js";

const PORT = parseInt(process.env.PORT || "10000", 10);

if (!process.env.E2B_API_KEY) {
  console.warn(
    "WARNING: E2B_API_KEY is not set. Tool calls that need E2B will fail until you set it in the Render dashboard.",
  );
}

if (!process.env.MCP_API_TOKEN) {
  console.warn(
    "WARNING: MCP_API_TOKEN is not set. The server is running without authentication.",
  );
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`E2B Computer Use MCP server listening on port ${PORT}`);
  console.log(`Health: http://0.0.0.0:${PORT}/health`);
  console.log(`MCP endpoint: http://0.0.0.0:${PORT}/mcp`);
});

process.on("SIGINT", () => {
  console.log("Shutting down server...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("Shutting down server...");
  process.exit(0);
});
