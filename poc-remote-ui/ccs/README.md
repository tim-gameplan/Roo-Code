# Roo Remote UI - Central Communication Server (PoC)

## Overview

This is the Central Communication Server (CCS) for the Roo Remote UI Proof of Concept. It provides a simple web interface that allows users to send messages to the Roo VS Code extension via IPC communication.

## Architecture

```
Mobile Browser → CCS (Express) → IPC → Roo Extension → Existing Webview
```

## Features

- **Express.js Server**: Lightweight web server serving mobile-optimized interface
- **IPC Communication**: Direct communication with Roo VS Code extension
- **Message Queuing**: Queues messages when IPC connection is unavailable
- **Real-time Status**: Live connection status monitoring
- **Mobile Responsive**: Optimized for mobile browsers and touch interfaces
- **Error Handling**: Comprehensive error handling and user feedback

## Quick Start

### Prerequisites

- Node.js 18+ installed
- Roo VS Code extension running with IPC handler enabled

### Installation

```bash
# Install dependencies
npm install

# Start the server
npm start

# Or start with auto-reload for development
npm run dev
```

### Access

- **Web Interface**: http://localhost:3000
- **Server Status**: http://localhost:3000/status
- **Health Check**: http://localhost:3000/health

## API Endpoints

### GET /
Serves the main web interface for sending messages to Roo.

### POST /send-message
Sends a message to the Roo extension via IPC.

**Request Body:**
```json
{
  "message": "Your message to Roo"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Message sent to Roo extension",
  "text": "Your message to Roo"
}
```

### GET /status
Returns server and IPC connection status.

**Response:**
```json
{
  "server": "running",
  "ipcConnected": true,
  "queuedMessages": 0,
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### GET /health
Health check endpoint for monitoring.

**Response:**
```json
{
  "status": "healthy",
  "uptime": 123.456,
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

## IPC Configuration

The server connects to the Roo extension using the following IPC configuration:

- **Server ID**: `roo-remote-poc`
- **Target ID**: `roo-extension`
- **Retry Interval**: 1500ms
- **Message Format**: `{ text: string, timestamp: string }`

## Message Flow

1. User submits form in web interface
2. Browser sends POST request to `/send-message`
3. CCS receives message and validates input
4. CCS sends message via IPC to `roo-extension`
5. Roo extension receives message and injects into webview
6. CCS responds to browser with success/error status

## Error Handling

### IPC Connection Issues
- Messages are queued when IPC is disconnected
- Automatic reconnection attempts every 1.5 seconds
- User receives feedback about connection status

### Input Validation
- Empty messages are rejected
- Message content is trimmed and validated
- Appropriate error responses sent to client

### Server Errors
- All errors are logged with timestamps
- User-friendly error messages returned
- Development vs production error detail levels

## Development

### File Structure
```
ccs/
├── package.json          # Dependencies and scripts
├── server.js            # Main server application
├── public/              # Static web assets
│   ├── index.html       # Main web interface
│   └── style.css        # Mobile-responsive styles
└── README.md           # This file
```

### Environment Variables
- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment mode (development/production)

### Logging
The server provides detailed console logging:
- 🚀 Server startup and configuration
- 📥 Incoming message requests
- 📤 Outgoing IPC messages
- ✅ Successful IPC connections
- ❌ Connection failures and errors
- ⏳ Message queuing when disconnected

## Testing

### Manual Testing
1. Start the CCS server
2. Open http://localhost:3000 in a browser
3. Check connection status indicator
4. Submit a test message
5. Verify message appears in Roo extension

### Mobile Testing
1. Find your computer's IP address
2. Access http://[IP]:3000 from mobile device
3. Test touch interactions and responsive layout
4. Verify functionality across different browsers

### Status Monitoring
- Check `/status` endpoint for connection health
- Monitor console logs for IPC communication
- Use `/health` endpoint for uptime monitoring

## Troubleshooting

### IPC Connection Issues
- Ensure Roo extension is running in VS Code
- Check that IPC handler is enabled in extension
- Verify no firewall blocking local IPC communication
- Check console logs for specific error messages

### Mobile Access Issues
- Ensure mobile device is on same network
- Check firewall settings on development machine
- Try accessing via IP address instead of localhost
- Verify port 3000 is not blocked

### Performance Issues
- Monitor memory usage with queued messages
- Check for IPC connection leaks
- Verify proper cleanup on server shutdown

## Security Considerations

### Development Only
This PoC is designed for development and testing only:
- No authentication or authorization
- No HTTPS/WSS encryption
- No input sanitization beyond basic validation
- Local network access only

### Production Considerations
For production deployment, consider:
- JWT-based authentication
- HTTPS/WSS encryption
- Input sanitization and validation
- Rate limiting and abuse prevention
- Proper error handling and logging

## Next Steps

Based on PoC results:
1. **If Successful**: Proceed with full Feature 2 implementation
2. **If Issues Found**: Document problems and potential solutions
3. **Performance Analysis**: Measure latency and resource usage
4. **Mobile Compatibility**: Test across different devices and browsers

## Related Documentation

- [PoC Implementation Plan](../../docs/poc-simplified-remote-ui.md)
- [Feature 2 SRS](../../docs/feature-2-remote-ui-srs.md)
- [Task Documentation](../../docs/tasks/task-001-simplified-remote-ui-poc.md)
