# Roo-Code Remote Access Setup Guide

## 🚀 Quick Start: Enabling Remote Access

### Step 1: Verify CCS Server is Running

The Cross-device Communication Server (CCS) should be running on `localhost:3001`. You can verify this by checking:

```bash
curl http://localhost:3001/health
```

Expected response:

```json
{ "status": "healthy", "timestamp": "...", "uptime": "..." }
```

### Step 2: Enable Remote Access in Roo-Code Extension

#### Option A: Through VSCode Command Palette

1. Open VSCode Command Palette (`Cmd+Shift+P` on Mac, `Ctrl+Shift+P` on Windows/Linux)
2. Type: `Roo-Code: Enable Remote Access`
3. Select the command and press Enter
4. The extension will connect to the CCS server and generate a session ID

#### Option B: Through Extension Settings

1. Open VSCode Settings (`Cmd+,` on Mac, `Ctrl+,` on Windows/Linux)
2. Search for "Roo-Code" or "Remote Access"
3. Enable the "Remote Access" setting
4. Set the CCS Server URL to `http://localhost:3001`

#### Option C: Through Extension UI

1. Open the Roo-Code extension panel in VSCode
2. Look for a "Remote Access" or "Enable Remote" button
3. Click to enable remote access
4. The extension will display a session URL

### Step 3: Access Remote UI

Once remote access is enabled, you'll receive a session URL in the format:

```
http://localhost:3001/remote/{sessionId}
```

For example:

```
http://localhost:3001/remote/session_abc123def456
```

### Step 4: Verify Connection

1. Open the session URL in your browser
2. You should see the Roo-Code remote interface
3. Test basic functionality like sending a message or command

## 🔧 Troubleshooting

### Issue: "Route not found" when accessing localhost:3001

**Cause:** You're accessing the root URL instead of a specific remote session endpoint.

**Solution:**

- Enable remote access in the extension first (see Step 2 above)
- Use the specific session URL provided by the extension

### Issue: Extension doesn't show remote access option

**Possible causes:**

1. Extension not fully loaded
2. CCS server not running
3. Extension configuration issue

**Solutions:**

1. Restart VSCode and ensure the extension is active
2. Verify CCS server is running: `curl http://localhost:3001/health`
3. Check VSCode Developer Console for errors

### Issue: Cannot connect to remote session

**Possible causes:**

1. Session expired
2. Network connectivity issues
3. CCS server restart

**Solutions:**

1. Generate a new session through the extension
2. Check firewall settings
3. Restart the CCS server if needed

## 📋 Available Endpoints

The CCS server provides these endpoints:

- `GET /health` - Server health check
- `GET /health/detailed` - Detailed health information
- `GET /health/metrics` - Performance metrics
- `GET /api` - API information
- `POST /api/v1/auth/*` - Authentication endpoints
- `GET /remote/:sessionId` - Remote session access

## 🔍 Debugging Steps

### 1. Check Extension Status

```javascript
// In VSCode Developer Console
console.log("Roo-Code Extension Status:", vscode.extensions.getExtension("roo-code"))
```

### 2. Verify CCS Server Connectivity

```bash
# Test health endpoint
curl http://localhost:3001/health

# Test remote endpoint structure
curl http://localhost:3001/remote/test-session
```

### 3. Check Extension Logs

1. Open VSCode Developer Tools (`Help > Toggle Developer Tools`)
2. Check Console for Roo-Code related messages
3. Look for connection attempts to localhost:3001

## 🎯 Expected Workflow

1. **Extension Activation:** Roo-Code extension loads in VSCode
2. **CCS Connection:** Extension connects to CCS server on localhost:3001
3. **Session Creation:** Extension requests a new remote session
4. **Session URL:** Extension provides session URL to user
5. **Remote Access:** User opens session URL in browser
6. **Bi-directional Communication:** Commands and responses flow between VSCode and browser

## 📞 Next Steps

If you're still having issues:

1. **Check Extension Installation:** Ensure Roo-Code extension is properly installed and enabled
2. **Restart Services:** Restart both VSCode and the CCS server
3. **Check Logs:** Review both extension logs and CCS server logs for errors
4. **Test Basic Functionality:** Try simple commands first before complex workflows

---

**Note:** This guide assumes you're running the development version of Roo-Code with the CCS server. For production deployments, the server URL and configuration may differ.
