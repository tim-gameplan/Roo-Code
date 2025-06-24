# TASK-003 Debugging and Completion Plan

## Current Status Analysis

### ✅ What's Working

- Extension Development Host launches successfully
- Roo Code extension loads and commands are available
- CCS server runs and attempts IPC connections
- IPC implementation code exists in codebase

### ❌ Core Issue

- Unix socket `/tmp/app.roo-extension` is not being created
- IPC communication between CCS server and extension fails

## Root Cause Hypotheses

### 1. Extension Activation Timing

**Hypothesis**: `setupRemoteUIListener()` may not be called during extension activation
**Evidence**: Socket doesn't exist despite extension loading
**Priority**: HIGH

### 2. Socket Creation Permissions

**Hypothesis**: Extension lacks permissions to create socket in `/tmp/`
**Evidence**: No socket file created, no error logs visible
**Priority**: MEDIUM

### 3. Extension Development Host Context

**Hypothesis**: Development host may not execute the modified extension code
**Evidence**: Commands work but IPC doesn't activate
**Priority**: HIGH

### 4. Node.js Module Restrictions

**Hypothesis**: VS Code extension context may restrict `net` module usage
**Evidence**: No socket creation despite code presence
**Priority**: MEDIUM

## Debugging Plan - Phase 1: Verification

### Step 1.1: Add Debug Logging

**Objective**: Confirm `setupRemoteUIListener()` execution
**Action**: Add console.log statements to trace execution flow

```typescript
// In ClineProvider.ts setupRemoteUIListener()
console.log("🔧 [DEBUG] setupRemoteUIListener() called")
console.log("🔧 [DEBUG] Creating server on socket:", socketPath)
// ... after server.listen
console.log("🔧 [DEBUG] IPC server listening on:", socketPath)
```

**Expected Result**: Debug logs in VS Code Developer Console
**If Fails**: Method not being called - check extension activation

### Step 1.2: Verify Extension Code Version

**Objective**: Ensure Extension Development Host runs modified code
**Action**: Add temporary console.log in extension.ts activation

```typescript
// In extension.ts activate()
console.log("🔧 [DEBUG] Extension activating with IPC support")
// ... after provider.setupRemoteUIListener()
console.log("🔧 [DEBUG] setupRemoteUIListener() called from activation")
```

**Expected Result**: Logs appear in Developer Console
**If Fails**: Extension Development Host not using current code

### Step 1.3: Check Developer Console

**Objective**: Review extension activation logs and errors
**Action**: Open VS Code Developer Console (Help > Toggle Developer Tools)
**Look For**:

- Extension activation messages
- IPC-related errors
- Socket creation failures
- Permission denied errors

## Debugging Plan - Phase 2: Socket Creation

### Step 2.1: Test Socket Path Permissions

**Objective**: Verify `/tmp/` write permissions
**Action**: Create test script to verify socket creation

```javascript
// test-socket.js
const net = require("net")
const path = "/tmp/test-socket"

const server = net.createServer()
server.listen(path, () => {
	console.log("✅ Socket created successfully")
	server.close()
})
server.on("error", (err) => {
	console.error("❌ Socket creation failed:", err)
})
```

**Expected Result**: Socket creates successfully
**If Fails**: Try alternative paths like `~/tmp/` or project directory

### Step 2.2: Alternative Socket Paths

**Objective**: Test different socket locations
**Action**: Modify `setupRemoteUIListener()` to use alternative paths

```typescript
// Try these paths in order:
const socketPaths = [
	"/tmp/app.roo-extension",
	path.join(os.homedir(), ".roo-extension.sock"),
	path.join(this.context.extensionPath, "roo-extension.sock"),
]
```

### Step 2.3: Synchronous vs Asynchronous Issues

**Objective**: Ensure proper async handling
**Action**: Add proper error handling and async/await

```typescript
public setupRemoteUIListener(): void {
    try {
        // Clean up existing socket
        if (fs.existsSync(socketPath)) {
            fs.unlinkSync(socketPath);
        }

        const server = net.createServer((socket) => {
            // ... handler code
        });

        server.on('error', (error) => {
            this.log(`❌ IPC server error: ${error}`);
        });

        server.listen(socketPath, () => {
            this.log(`✅ IPC server listening on ${socketPath}`);
        });
    } catch (error) {
        this.log(`❌ Failed to setup IPC: ${error}`);
    }
}
```

## Debugging Plan - Phase 3: Extension Context

### Step 3.1: Verify Extension Host Environment

**Objective**: Confirm extension runs in correct context
**Action**: Check extension host process and environment

```bash
# Check running VS Code processes
ps aux | grep "Extension Host"
# Look for extension development host specifically
```

### Step 3.2: Force Extension Reload

**Objective**: Ensure latest code is loaded
**Action**:

1. Close Extension Development Host
2. Rebuild extension: `cd src && npm run compile`
3. Relaunch: `code --extensionDevelopmentPath=. --disable-extensions`

### Step 3.3: Manual Extension Activation

**Objective**: Trigger extension activation explicitly
**Action**: In Extension Development Host, run commands:

1. "Developer: Reload Window"
2. "Roo Code: Focus on Roo Code View"
3. Check for socket creation after each step

## Debugging Plan - Phase 4: Alternative Approaches

### Step 4.1: HTTP-based IPC Fallback

**Objective**: Test if HTTP works where Unix sockets fail
**Action**: Implement temporary HTTP endpoint for IPC

```typescript
// Alternative IPC using HTTP
const express = require("express")
const app = express()
app.post("/ipc", (req, res) => {
	// Handle IPC messages
})
app.listen(3001, () => {
	this.log("IPC HTTP server on port 3001")
})
```

### Step 4.2: File-based Communication

**Objective**: Use filesystem for IPC if sockets fail
**Action**: Implement file-based message queue

```typescript
// Write messages to file, poll for responses
const ipcDir = path.join(os.tmpdir(), "roo-ipc")
// Extension writes to: ipcDir/from-extension.json
// CCS reads from: ipcDir/from-extension.json
// CCS writes to: ipcDir/to-extension.json
```

## Execution Timeline

### Immediate (Next 30 minutes)

1. Add debug logging to extension code
2. Rebuild and relaunch Extension Development Host
3. Check Developer Console for logs
4. Test socket path permissions

### Short-term (Next 1-2 hours)

1. Try alternative socket paths
2. Implement proper error handling
3. Test manual extension activation
4. Verify extension host environment

### Fallback (If socket issues persist)

1. Implement HTTP-based IPC
2. Test file-based communication
3. Document alternative approaches

## Success Criteria

### Phase 1 Success

- Debug logs appear in Developer Console
- `setupRemoteUIListener()` execution confirmed
- Socket creation attempt logged

### Phase 2 Success

- Unix socket file created at specified path
- CCS server successfully connects to socket
- Basic IPC handshake established

### Phase 3 Success

- Extension properly activated in development host
- All extension functionality working
- IPC communication fully functional

### Final Success

- CCS server connects to extension via IPC
- Remote UI can send messages to extension
- Extension can respond to remote UI requests
- Full bidirectional communication established

## Risk Mitigation

### If Unix Sockets Don't Work

- Fall back to HTTP-based IPC on localhost
- Use file-based communication as last resort
- Document platform-specific limitations

### If Extension Context Restricts IPC

- Move IPC to separate Node.js process
- Use VS Code extension API for communication bridge
- Implement message relay through webview

### If Development Host Issues Persist

- Test with packaged extension (.vsix)
- Use production VS Code with development extension
- Implement remote debugging capabilities

## Next Actions

1. **Immediate**: Add debug logging and rebuild extension
2. **Priority**: Check Developer Console for activation logs
3. **Critical**: Verify socket creation and permissions
4. **Fallback**: Prepare alternative IPC mechanisms

This plan provides a systematic approach to identify and resolve the IPC connection issue, with multiple fallback options to ensure task completion.
