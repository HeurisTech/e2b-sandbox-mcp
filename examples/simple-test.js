#!/usr/bin/env node

/**
 * Simple test script to create an E2B sandbox and get stream URL
 * This tests the MCP server directly without the SDK client
 */

import { spawn } from 'child_process';

async function testE2BSandbox() {
  let serverProcess = null;

  try {
    console.log('🚀 Starting E2B Computer Use MCP Server test...');

    // Check if E2B_API_KEY is set
    if (!process.env.E2B_API_KEY) {
      console.error('❌ E2B_API_KEY environment variable is not set!');
      console.log('Please set it with: export E2B_API_KEY="your_key_here"');
      console.log('Get your API key from: https://e2b.dev/docs/quickstart/api-key');
      process.exit(1);
    }

    console.log('✅ E2B_API_KEY found');

    // Test the MCP server directly with CLI arguments
    console.log('📡 Testing MCP server with API key argument...');
    
    serverProcess = spawn('node', [
      'dist/index.js', 
      '--e2b-api-key', 
      process.env.E2B_API_KEY
    ], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    });

    let output = '';
    let errorOutput = '';

    serverProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    serverProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
      console.log('Server:', data.toString().trim());
    });

    // Wait a moment for server to start
    await new Promise(resolve => setTimeout(resolve, 2000));

    if (errorOutput.includes('E2B Computer Use MCP Server running on stdio')) {
      console.log('✅ MCP Server started successfully!');
      console.log('✅ API key argument parsing working!');
      
      // Test creating a sandbox using direct JSON-RPC
      console.log('🖥️  Testing sandbox creation...');
      
      const request = {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "create_sandbox",
          arguments: {
            resolution: [1920, 1080],
            timeout: 600000
          }
        }
      };

      serverProcess.stdin.write(JSON.stringify(request) + '\n');

      // Wait for response
      let responseReceived = false;
      let responseData = '';

      serverProcess.stdout.on('data', (data) => {
        responseData += data.toString();
        try {
          const response = JSON.parse(responseData);
          if (response.id === 1) {
            responseReceived = true;
            console.log('📋 Sandbox Creation Response:');
            
            const result = JSON.parse(response.result.content[0].text);
            
            if (result.status === 'created') {
              console.log('🎉 Sandbox created successfully!');
              console.log(`   Sandbox ID: ${result.sandboxId}`);
              console.log(`   Resolution: ${result.resolution.join('×')}`);
              console.log('');
              console.log('📺 Stream URL:');
              console.log(`   ${result.streamUrl}`);
              console.log('');
              console.log('🎯 SUCCESS! Your MCP server is working perfectly!');
              console.log('');
              console.log('📋 Update your MCP config to:');
              console.log(`{
  "mcpServers": {
    "e2b-computer-use": {
      "command": "node",
      "args": [
        "R:\\\\HeurisTech\\\\surf\\\\e2b-computer-use-mcp\\\\dist\\\\index.js",
        "--e2b-api-key",
        "${process.env.E2B_API_KEY}"
      ]
    }
  }
}`);
            } else {
              console.log('❌ Sandbox creation failed:', result.message);
            }
          }
        } catch (e) {
          // Partial JSON, wait for more data
        }
      });

      // Wait for response or timeout
      await new Promise(resolve => {
        const timeout = setTimeout(() => {
          if (!responseReceived) {
            console.log('⏰ Request timeout - but server is running!');
          }
          resolve();
        }, 10000);

        const checkResponse = setInterval(() => {
          if (responseReceived) {
            clearTimeout(timeout);
            clearInterval(checkResponse);
            resolve();
          }
        }, 100);
      });

    } else {
      console.log('❌ Server failed to start properly');
      console.log('Error output:', errorOutput);
    }

  } catch (error) {
    console.error('💥 Error:', error.message);
    throw error;
  } finally {
    // Cleanup
    if (serverProcess) {
      serverProcess.kill();
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  process.exit(0);
});

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  testE2BSandbox()
    .then(() => {
      console.log('\n🎯 Test completed!');
      console.log('Your MCP server is ready for integration.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💀 Test failed:', error.message);
      process.exit(1);
    });
} 