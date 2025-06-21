# Roo Remote UI PoC - Setup Instructions

## Overview

This document provides step-by-step instructions for setting up and running the Roo Remote UI Proof of Concept.

## Prerequisites

### System Requirements
- **Operating System**: macOS, Linux, or Windows with WSL
- **Node.js**: Version 18.0.0 or higher
- **VS Code**: Latest version with Roo extension installed
- **Network**: Local network access for mobile testing

### Verification Commands
```bash
# Check Node.js version
node --version  # Should be v18.0.0 or higher

# Check npm version
npm --version

# Check VS Code installation
code --version
```

## Installation Steps

### 1. Navigate to PoC Directory
```bash
cd poc-remote-ui/ccs
```

### 2. Install Dependencies
```bash
npm install
```

Expected output:
```
added 45 packages, and audited 46 packages in 2s
found 0 vulnerabilities
```

### 3. Verify Installation
```bash
# Check if all dependencies are installed
ls node_modules/

# Should include: express, node-ipc, cors, nodemon
```

## Running the PoC

### Method 1: Using Helper Script (Recommended)
```bash
# From the poc-remote-ui directory
./scripts/start-poc.sh
```

### Method 2: Manual Start
```bash
# From the ccs directory
cd poc-remote-ui/ccs
npm start
```

### Expected Output
```
🚀 Roo Remote UI PoC Server running on http://localhost:3000
📊 Status endpoint: http://localhost:3000/status
🏥 Health endpoint: http://localhost:3000/health
Attempting to connect to Roo extension via IPC...
```

## Testing the Setup

### 1. Basic Server Test
```bash
# From the poc-remote-ui directory
./scripts/test-poc.sh
```

### 2. Manual Browser Test
1. Open browser and navigate to `http://localhost:3000`
2. Verify the interface loads correctly
3. Check the connection status indicator
4. Try submitting a test message

### 3. Mobile Device Test
1. Find your computer's IP address:
   ```bash
   # On macOS/Linux
   ifconfig | grep "inet " | grep -v 127.0.0.1
   
   # On Windows
   ipconfig | findstr "IPv4"
   ```

2. On mobile device, navigate to `http://[YOUR_IP]:3000`
3. Test the responsive interface
4. Submit a test message

## Roo Extension Setup

### 1. Locate ClineProvider.ts
The file should be at: `src/core/ClineProvider.ts`

### 2. Add IPC Handler Method
Add this method to the ClineProvider class:

```typescript
private setupRemoteUIListener() {
    const ipc = require('node-ipc');
    
    ipc.config.id = 'roo-extension';
    ipc.config.retry = 1500;
    ipc.config.silent = false;
    
    ipc.serve(() => {
        ipc.server.on('remote-message', async (data, socket) => {
            try {
                console.log('📨 Received remote message:', data);
                
                if (data.text) {
                    // Use existing message system to set chat input
                    await this.postMessageToWebview({
                        type: "invoke",
                        invoke: "setChatBoxMessage",
                        text: data.text
                    });
                    
                    console.log('✅ Message injected into webview');
                    
                    // Send success response back to CCS
                    ipc.server.emit(socket, 'message-received', { 
                        success: true,
                        timestamp: new Date().toISOString()
                    });
                }
            } catch (error) {
                console.error('🚨 Remote UI error:', error);
                ipc.server.emit(socket, 'message-received', { 
                    success: false, 
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });
        
        console.log('🎧 Remote UI IPC server listening...');
    });
    
    ipc.server.start();
}
```

### 3. Initialize IPC Handler
Add this line to the ClineProvider constructor or initialization method:

```typescript
// Initialize remote UI listener
this.setupRemoteUIListener();
```

### 4. Restart VS Code Extension
1. Open VS Code
2. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS)
3. Type "Developer: Reload Window"
4. Press Enter to reload the extension

## Troubleshooting

### Common Issues

#### 1. "EADDRINUSE: address already in use"
**Problem**: Port 3000 is already in use
**Solution**:
```bash
# Find process using port 3000
lsof -i :3000

# Kill the process (replace PID with actual process ID)
kill -9 [PID]

# Or use a different port
PORT=3001 npm start
```

#### 2. "Cannot connect to Roo extension"
**Problem**: IPC connection fails
**Solutions**:
- Ensure VS Code with Roo extension is running
- Verify IPC handler is added to ClineProvider.ts
- Check VS Code Developer Console for errors
- Restart VS Code extension

#### 3. "Module not found" errors
**Problem**: Dependencies not installed
**Solution**:
```bash
cd poc-remote-ui/ccs
rm -rf node_modules package-lock.json
npm install
```

#### 4. Mobile device cannot access server
**Problem**: Network connectivity issues
**Solutions**:
- Ensure mobile device is on same WiFi network
- Check firewall settings on development machine
- Try accessing via computer's IP address instead of localhost
- Verify port 3000 is not blocked

### Debug Mode

#### Enable Verbose Logging
```bash
# Set environment variable for detailed logs
DEBUG=* npm start
```

#### Check IPC Communication
Monitor VS Code Developer Console:
1. Open VS Code
2. Press `Ctrl+Shift+P` (or `Cmd+Shift+P`)
3. Type "Developer: Toggle Developer Tools"
4. Check Console tab for IPC messages

#### Network Debugging
```bash
# Test server endpoints
curl http://localhost:3000/health
curl http://localhost:3000/status

# Test message sending
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"message":"Test message"}' \
  http://localhost:3000/send-message
```

## Performance Monitoring

### Server Performance
```bash
# Monitor server resource usage
top -p $(pgrep -f "node.*server.js")

# Check memory usage
ps aux | grep "node.*server.js"
```

### Network Latency
```bash
# Test response times
time curl http://localhost:3000/health

# Multiple requests test
for i in {1..10}; do
  time curl -s http://localhost:3000/health > /dev/null
done
```

## Security Considerations

### Development Environment Only
This PoC is designed for development testing only:
- No authentication or authorization
- No HTTPS encryption
- Local network access only
- Basic input validation

### Network Security
- Ensure development machine firewall is properly configured
- Only allow access from trusted devices on local network
- Monitor for unusual network activity

## Next Steps

### After Successful Setup
1. **Test Message Flow**: Verify end-to-end message injection
2. **Mobile Compatibility**: Test on various mobile devices and browsers
3. **Performance Testing**: Measure latency and resource usage
4. **Documentation**: Record findings and issues

### If Issues Encountered
1. **Document Problems**: Record specific error messages and conditions
2. **Try Alternatives**: Test different configurations or approaches
3. **Gather Data**: Collect performance metrics and logs
4. **Update Documentation**: Add troubleshooting steps for future reference

## Support

### Getting Help
- Check console logs for detailed error messages
- Review troubleshooting section above
- Test with the provided test script
- Monitor VS Code Developer Console for extension issues

### Reporting Issues
When reporting issues, include:
- Operating system and version
- Node.js version
- VS Code version
- Exact error messages
- Steps to reproduce
- Console logs from both server and VS Code

---

**This setup enables testing of the simplified remote UI approach that could potentially reduce Feature 2 development time from 15 weeks to 4-6 weeks.**
