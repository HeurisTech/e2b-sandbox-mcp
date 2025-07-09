/**
 * Example Express.js server that integrates E2B Computer Use MCP Server
 * This shows how to create a web API that exposes computer use functionality
 */

import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { spawn } from 'child_process';
import { MCPClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// MCP Client setup
let mcpClient = null;
let mcpTransport = null;

async function initializeMCPClient() {
  try {
    console.log('Initializing MCP client...');
    
    // Spawn the E2B Computer Use MCP server
    const serverProcess = spawn('node', ['../../dist/index.js'], {
      stdio: ['pipe', 'pipe', 'inherit'],
      env: {
        ...process.env,
        E2B_API_KEY: process.env.E2B_API_KEY,
      },
    });

    // Create MCP client and transport
    mcpClient = new MCPClient(
      { name: 'web-client', version: '1.0.0' },
      { capabilities: {} }
    );

    mcpTransport = new StdioClientTransport({
      stdin: serverProcess.stdin,
      stdout: serverProcess.stdout,
    });

    await mcpClient.connect(mcpTransport);
    console.log('MCP client connected successfully');
  } catch (error) {
    console.error('Failed to initialize MCP client:', error);
    throw error;
  }
}

// API Routes

// Create a new desktop session
app.post('/api/sessions', async (req, res) => {
  try {
    const { resolution = [1920, 1080], timeout = 600000 } = req.body;

    const result = await mcpClient.request({
      method: 'tools/call',
      params: {
        name: 'create_sandbox',
        arguments: { resolution, timeout },
      },
    });

    const response = JSON.parse(result.content[0].text);
    
    if (response.status !== 'created') {
      throw new Error(response.message);
    }

    res.json({
      success: true,
      session: {
        sandboxId: response.sandboxId,
        streamUrl: response.streamUrl,
        resolution: response.resolution,
      },
    });
  } catch (error) {
    console.error('Failed to create session:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Execute computer action
app.post('/api/sessions/:sandboxId/actions', async (req, res) => {
  try {
    const { sandboxId } = req.params;
    const { action } = req.body;

    const result = await mcpClient.request({
      method: 'tools/call',
      params: {
        name: 'execute_computer_action',
        arguments: { sandboxId, action },
      },
    });

    const response = JSON.parse(result.content[0].text);
    
    res.json({
      success: response.success,
      result: response,
    });
  } catch (error) {
    console.error('Failed to execute action:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get screenshot
app.get('/api/sessions/:sandboxId/screenshot', async (req, res) => {
  try {
    const { sandboxId } = req.params;

    const result = await mcpClient.request({
      method: 'tools/call',
      params: {
        name: 'get_screenshot',
        arguments: { sandboxId },
      },
    });

    const imageContent = result.content.find(c => c.type === 'image');
    if (!imageContent) {
      throw new Error('No image content in response');
    }

    // Return base64 image
    res.json({
      success: true,
      image: {
        data: imageContent.data,
        mimeType: imageContent.mimeType || 'image/png',
      },
    });
  } catch (error) {
    console.error('Failed to get screenshot:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get stream URL
app.get('/api/sessions/:sandboxId/stream', async (req, res) => {
  try {
    const { sandboxId } = req.params;

    const result = await mcpClient.request({
      method: 'tools/call',
      params: {
        name: 'get_stream_url',
        arguments: { sandboxId },
      },
    });

    const response = JSON.parse(result.content[0].text);
    
    res.json({
      success: true,
      streamUrl: response.streamUrl,
    });
  } catch (error) {
    console.error('Failed to get stream URL:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// List all sessions
app.get('/api/sessions', async (req, res) => {
  try {
    const result = await mcpClient.request({
      method: 'tools/call',
      params: {
        name: 'list_sandboxes',
        arguments: {},
      },
    });

    const response = JSON.parse(result.content[0].text);
    
    res.json({
      success: true,
      sessions: response.active,
    });
  } catch (error) {
    console.error('Failed to list sessions:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Cleanup session
app.delete('/api/sessions/:sandboxId', async (req, res) => {
  try {
    const { sandboxId } = req.params;

    const result = await mcpClient.request({
      method: 'tools/call',
      params: {
        name: 'cleanup_sandbox',
        arguments: { sandboxId },
      },
    });

    const response = JSON.parse(result.content[0].text);
    
    res.json({
      success: response.success,
    });
  } catch (error) {
    console.error('Failed to cleanup session:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// WebSocket for real-time communication
wss.on('connection', (ws) => {
  console.log('WebSocket client connected');

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      switch (data.type) {
        case 'execute_action':
          const result = await mcpClient.request({
            method: 'tools/call',
            params: {
              name: 'execute_computer_action',
              arguments: {
                sandboxId: data.sandboxId,
                action: data.action,
              },
            },
          });

          const response = JSON.parse(result.content[0].text);
          ws.send(JSON.stringify({
            type: 'action_result',
            success: response.success,
            result: response,
          }));
          break;

        case 'get_screenshot':
          const screenshotResult = await mcpClient.request({
            method: 'tools/call',
            params: {
              name: 'get_screenshot',
              arguments: { sandboxId: data.sandboxId },
            },
          });

          const imageContent = screenshotResult.content.find(c => c.type === 'image');
          ws.send(JSON.stringify({
            type: 'screenshot',
            image: imageContent ? imageContent.data : null,
          }));
          break;

        default:
          ws.send(JSON.stringify({
            type: 'error',
            message: `Unknown message type: ${data.type}`,
          }));
      }
    } catch (error) {
      console.error('WebSocket error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: error.message,
      }));
    }
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    mcpConnected: mcpClient !== null,
    timestamp: new Date().toISOString(),
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Express error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down...');
  
  if (mcpClient) {
    await mcpClient.close();
  }
  
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Start server
async function startServer() {
  try {
    await initializeMCPClient();
    
    const PORT = process.env.PORT || 3001;
    server.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log('API endpoints:');
      console.log('  POST /api/sessions - Create new desktop session');
      console.log('  GET /api/sessions - List all sessions');
      console.log('  POST /api/sessions/:id/actions - Execute computer action');
      console.log('  GET /api/sessions/:id/screenshot - Get screenshot');
      console.log('  GET /api/sessions/:id/stream - Get stream URL');
      console.log('  DELETE /api/sessions/:id - Cleanup session');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer(); 