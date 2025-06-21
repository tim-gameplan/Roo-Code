#!/bin/bash

# Roo-Code MCP Servers Setup Script
# This script builds and configures the ESLint and Prettier MCP servers

set -e

echo "🚀 Setting up Roo-Code MCP Servers..."

# Get the absolute path to the mcp-servers directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "📁 Project root: $PROJECT_ROOT"
echo "📁 MCP servers directory: $SCRIPT_DIR"

# Build ESLint server
echo "🔧 Building ESLint MCP Server..."
cd "$SCRIPT_DIR/eslint-server"
npm install
npm run build
echo "✅ ESLint server built successfully"

# Build Prettier server
echo "🎨 Building Prettier MCP Server..."
cd "$SCRIPT_DIR/prettier-server"
npm install
npm run build
echo "✅ Prettier server built successfully"

# Update MCP configuration with correct paths
echo "⚙️  Updating MCP configuration..."
cat > "$SCRIPT_DIR/mcp-config.json" << EOF
{
	"mcpServers": {
		"eslint-code-quality": {
			"command": "node",
			"args": ["$SCRIPT_DIR/eslint-server/dist/index.js"],
			"env": {}
		},
		"prettier-formatter": {
			"command": "node",
			"args": ["$SCRIPT_DIR/prettier-server/dist/index.js"],
			"env": {}
		}
	}
}
EOF

echo "✅ MCP configuration updated"

# Test the servers
echo "🧪 Testing MCP servers..."

echo "Testing ESLint server..."
if echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}' | node "$SCRIPT_DIR/eslint-server/dist/index.js" > /dev/null 2>&1; then
    echo "✅ ESLint server is working"
else
    echo "❌ ESLint server test failed"
fi

echo "Testing Prettier server..."
if echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}' | node "$SCRIPT_DIR/prettier-server/dist/index.js" > /dev/null 2>&1; then
    echo "✅ Prettier server is working"
else
    echo "❌ Prettier server test failed"
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Restart your MCP client (Cline) to load the new servers"
echo "2. The servers are now available as:"
echo "   - eslint-code-quality"
echo "   - prettier-formatter"
echo ""
echo "📖 See README.md for usage examples and troubleshooting"
echo ""
echo "🔧 Server paths:"
echo "   ESLint: $SCRIPT_DIR/eslint-server/dist/index.js"
echo "   Prettier: $SCRIPT_DIR/prettier-server/dist/index.js"
