#!/bin/bash

# Roo-Code Web UI Startup Script
echo "🚀 Starting Roo-Code Web Interface..."

# Check if we're in the correct directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Please run this script from the web-ui directory."
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Start the development server
echo "🌐 Starting development server on http://localhost:5173"
echo "📱 Web interface will be available for remote access to Roo-Code"
echo ""
echo "Prerequisites:"
echo "  ✅ Production CCS server should be running on localhost:3001"
echo "  ✅ VSCode extension should be active"
echo ""

npm run dev
