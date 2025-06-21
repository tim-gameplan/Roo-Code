#!/bin/bash

# Roo Remote UI PoC - Start Script
# This script starts the Central Communication Server for the PoC

set -e

echo "🚀 Starting Roo Remote UI Proof of Concept"
echo "=========================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ and try again."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ is required. Current version: $(node --version)"
    exit 1
fi

echo "✅ Node.js version: $(node --version)"

# Navigate to CCS directory
cd "$(dirname "$0")/../ccs"

# Check if package.json exists
if [ ! -f "package.json" ]; then
    echo "❌ package.json not found in CCS directory"
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo "✅ Dependencies installed"
else
    echo "✅ Dependencies already installed"
fi

# Check if Roo extension is running (optional check)
echo ""
echo "📋 Pre-flight checklist:"
echo "  1. ✅ Node.js 18+ installed"
echo "  2. ✅ Dependencies installed"
echo "  3. ⚠️  Ensure Roo VS Code extension is running"
echo "  4. ⚠️  Ensure IPC handler is enabled in extension"
echo ""

# Start the server
echo "🚀 Starting Central Communication Server..."
echo "📱 Web interface will be available at: http://localhost:3000"
echo "📊 Server status: http://localhost:3000/status"
echo "🏥 Health check: http://localhost:3000/health"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start with npm start
npm start
