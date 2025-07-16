# RCCS First Run Usage Guide

## Complete Step-by-Step Testing Process

This guide walks you through testing the RCCS (Roo Code Communication Server) remote UI feature for the first time.

## Prerequisites ✅

The automation script has already completed:

- ✅ Docker services (PostgreSQL + Redis) running
- ✅ Production CCS server configured and tested
- ✅ Database migrations applied
- ✅ Basic health checks passed

## Testing Scenario

**Goal**: Launch VSCode in developer mode with Roo Code extension and interact with the Roo UI from a remote client (mobile device, tablet, or second computer).

---

## Step 1: Start the RCCS Server

### Terminal 1: Start the Communication Server

```bash
cd production-ccs
pnpm run dev
```

**Expected Output:**

```
[INFO] Server started successfully on port 3001
[INFO] Database service initialized
[INFO] Redis service initialized
[INFO] Extension service initialized
[INFO] WebSocket server ready for connections
```

**Verify Server is Running:**

```bash
curl http://localhost:3001/health
```

Should return: `{"status":"ok","timestamp":"..."}`

---

## Step 2: Launch VSCode in Developer Mode

### Terminal 2: Start VSCode Extension Development

```bash
# From the root directory
pnpm run dev:extension
```

**Alternative Method:**

1. Open VSCode
2. Press `F5` or go to `Run > Start Debugging`
3. Select "Launch Extension" from the debug configuration
4. A new VSCode window will open with the extension loaded

### Verify Extension is Active

In the new VSCode window:

1. Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Type "Cline" or "Roo Code"
3. You should see Cline/Roo Code commands available
4. Click on the Cline icon in the sidebar (if visible)

---

## Step 3: Enable Remote UI Access

### In the VSCode Extension Window:

1. **Open Cline/Roo Code Panel**

    - Click the Cline icon in the sidebar, OR
    - Use Command Palette: "Cline: Open"

2. **Enable Remote Access**

    - Look for "Remote Access" or "Share Session" option
    - Click to enable remote UI access
    - The extension should connect to the RCCS server at `localhost:3001`

3. **Get Connection Details**
    - The extension should display:
        - Session ID (e.g., `session_abc123`)
        - Connection URL (e.g., `http://localhost:3001/remote/session_abc123`)
        - QR Code (for mobile access)

---

## Step 4: Connect from Remote Client

### Option A: Mobile Device/Tablet

1. **Connect to Same Network**

    - Ensure your mobile device is on the same WiFi network
    - Find your computer's IP address: `ifconfig` (Mac/Linux) or `ipconfig` (Windows)

2. **Access Remote UI**
    - Open browser on mobile device
    - Navigate to: `http://[YOUR_IP]:3001/remote/[SESSION_ID]`
    - Example: `http://192.168.1.100:3001/remote/session_abc123`
    - OR scan the QR code displayed in VSCode

### Option B: Second Computer

1. **Same Network Access**
    - Open browser on second computer
    - Navigate to: `http://[YOUR_IP]:3001/remote/[SESSION_ID]`

### Option C: Local Testing

1. **Same Computer Different Browser**
    - Open a different browser (Chrome, Firefox, Safari)
    - Navigate to: `http://localhost:3001/remote/[SESSION_ID]`

---

## Step 5: Test Remote Interaction

### What You Should See:

1. **Remote UI Loads**

    - Cline/Roo Code interface appears in browser
    - Chat interface is visible
    - File explorer (if implemented) shows current workspace

2. **Real-time Sync**
    - Type a message in the remote browser
    - Message should appear in VSCode extension
    - Responses from Cline should appear in both interfaces

### Test Interactions:

1. **Send a Simple Command**

    ```
    Hello Cline, can you list the files in the current directory?
    ```

2. **Test File Operations**

    ```
    Create a test file called hello.txt with "Hello from remote!"
    ```

3. **Test Real-time Updates**
    - Make changes in VSCode
    - Verify they appear in remote UI
    - Make changes in remote UI
    - Verify they appear in VSCode

---

## Step 6: Monitor and Debug

### Check Server Logs (Terminal 1)

Monitor the RCCS server output for:

- WebSocket connections
- Message routing
- Error messages
- Session management

### Check Extension Logs

In VSCode Developer Tools:

1. `Help > Toggle Developer Tools`
2. Check Console for extension logs
3. Look for RCCS connection status

### Check Browser Console

In remote client browser:

1. Open Developer Tools (`F12`)
2. Check Console for WebSocket connections
3. Monitor Network tab for API calls

---

## Expected Behavior

### ✅ Success Indicators:

- Remote UI loads without errors
- Messages sync between VSCode and remote client
- File operations work from remote interface
- Real-time updates appear in both interfaces
- WebSocket connection remains stable

### ❌ Troubleshooting:

- **Connection Failed**: Check if RCCS server is running on port 3001
- **UI Not Loading**: Verify session ID and URL are correct
- **No Sync**: Check WebSocket connection in browser console
- **Extension Not Found**: Ensure VSCode is in debug mode with extension loaded

---

## Useful Commands During Testing

### Check Services Status:

```bash
# Check Docker services
cd docker/development && docker-compose ps

# Check RCCS server
curl http://localhost:3001/health

# Check database connection
docker exec -it roo-code-postgres-dev psql -U roo_dev -d roo_code_dev -c "SELECT NOW();"

# Check Redis
docker exec -it roo-code-redis-dev redis-cli ping
```

### Stop Services:

```bash
# Stop RCCS server: Ctrl+C in Terminal 1
# Stop VSCode extension: Close debug VSCode window
# Stop Docker services:
cd docker/development && docker-compose down
```

---

## Documentation During Testing

### Record Your Results:

1. **Update Test Session**: `docs/testing/current-test-session.md`
2. **Log Issues**: `docs/testing/known-issues.md`
3. **Record Results**: `docs/testing/test-results-log.md`

### Take Screenshots:

- VSCode with extension active
- Remote UI in browser
- Both interfaces showing synchronized content
- Any error messages

---

## Next Steps After First Test

1. **Phase 2**: Test with multiple remote clients
2. **Phase 3**: Test file synchronization features
3. **Phase 4**: Test cross-device handoff
4. **Phase 5**: Test mobile-specific features

---

## Support

If you encounter issues:

1. Check the logs in all terminals
2. Verify network connectivity
3. Ensure all services are running
4. Document issues in `docs/testing/known-issues.md`
5. Update test progress in `docs/testing/current-test-session.md`

**Happy Testing! 🚀**
