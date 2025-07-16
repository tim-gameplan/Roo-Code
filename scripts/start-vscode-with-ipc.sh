#!/bin/bash

# Start VSCode with IPC enabled for Roo-Code Remote Access
# This enables the VSCode extension to receive messages from the remote UI

export ROO_CODE_IPC_SOCKET_PATH="/tmp/app.roo-extension"

echo "🚀 Starting VSCode with Roo-Code IPC enabled"
echo "============================================"
echo ""
echo "📡 IPC Socket Path: $ROO_CODE_IPC_SOCKET_PATH"
echo ""
echo "This enables the Roo-Code extension to receive messages"
echo "from the mobile remote UI."
echo ""
echo "After VSCode starts:"
echo "1. The extension will create an IPC server"
echo "2. Remote UI messages will start a new task"
echo "3. Messages from your phone will appear in Roo-Code"
echo ""

# Start VSCode with the environment variable
code "${1:-.}"

echo ""
echo "✅ VSCode started with IPC enabled"
echo "📱 Now messages from http://localhost:8081 will work!"