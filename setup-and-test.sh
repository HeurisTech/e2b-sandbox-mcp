#!/bin/bash

echo "🏄 E2B Computer Use MCP Setup & Test"
echo "===================================="

# Check if E2B_API_KEY is set
if [ -z "$E2B_API_KEY" ]; then
    echo "❌ E2B_API_KEY is not set!"
    echo ""
    echo "Please get your API key from: https://e2b.dev/docs/quickstart/api-key"
    echo "Then set it with:"
    echo "  export E2B_API_KEY=\"your_key_here\""
    echo ""
    echo "Or create a .env file:"
    echo "  echo \"E2B_API_KEY=your_key_here\" > .env"
    echo "  source .env"
    exit 1
fi

echo "✅ E2B_API_KEY found"

# Build the project
echo "🔨 Building TypeScript..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

echo "✅ Build successful"

# Run the test
echo "🚀 Testing E2B sandbox creation..."
node examples/simple-test.js

echo ""
echo "🎯 Setup complete! Your MCP server is ready for integration." 