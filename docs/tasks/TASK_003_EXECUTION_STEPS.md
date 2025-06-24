# TASK-003 Debugging Execution Steps

## Current Status

- ✅ Debug logging added to extension code
- ✅ Extension rebuilt successfully
- ✅ Socket permissions verified (working)
- ⏳ **NEXT**: Verify extension activation with debug logs

## Phase 1: Extension Activation Verification

### Step 1: Relaunch Extension Development Host

**Action Required**: Please follow these steps:

1. **Close any existing Extension Development Host windows**
2. **In the main VS Code window**, run the command:
    ```
    code --extensionDevelopmentPath=. --disable-extensions
    ```
3. **Wait for the new Extension Development Host window to open**

### Step 2: Check Developer Console for Debug Logs

**Action Required**: In the Extension Development Host window:

1. **Open Developer Tools**: `Help > Toggle Developer Tools`
2. **Go to Console tab**
3. **Look for these debug messages**:
    ```
    🔧 [DEBUG] Extension activating with IPC support
    🔧 [DEBUG] setupRemoteUIListener() called from activation
    🔧 [DEBUG] setupRemoteUIListener() called
    🔧 [DEBUG] Creating server on socket: /tmp/app.roo-extension
    ```

### Step 3: Trigger Extension Functionality

**Action Required**: In the Extension Development Host:

1. **Open Command Palette**: `Cmd+Shift+P` (Mac) or `Ctrl+Shift+P` (Windows/Linux)
2. **Run command**: `Roo Code: Focus on Roo Code View`
3. **Check console for additional debug logs**

### Step 4: Verify Socket Creation

**Action Required**: After running the command, check if socket was created:

```bash
ls -la /tmp/app.roo-extension
```

## Expected Results

### ✅ Success Scenario

- Debug logs appear in Developer Console
- Socket file exists at `/tmp/app.roo-extension`
- CCS server connects successfully

### ❌ Failure Scenarios

#### Scenario A: No Debug Logs

**Diagnosis**: Extension Development Host not using updated code
**Next Steps**:

- Verify extension path in launch command
- Check if extension is actually activating
- Try manual reload: `Developer: Reload Window`

#### Scenario B: Debug Logs But No Socket

**Diagnosis**: Extension context restricts `net` module or socket creation
**Next Steps**:

- Check for error messages in console
- Implement HTTP-based IPC fallback
- Try alternative socket paths

#### Scenario C: Socket Created But CCS Can't Connect

**Diagnosis**: Socket permissions or path issues
**Next Steps**:

- Check socket file permissions
- Verify CCS server socket path configuration
- Test manual connection to socket

## Phase 2: If Phase 1 Fails

### Alternative Socket Paths

If `/tmp/app.roo-extension` fails, try these paths in order:

1. `~/Documents/roo-extension.sock`
2. `~/.roo-extension.sock`
3. `./roo-extension.sock` (project directory)

### HTTP Fallback Implementation

If Unix sockets fail completely, implement HTTP-based IPC:

```typescript
// In ClineProvider.ts - Alternative IPC
const express = require("express")
const app = express()
app.use(express.json())

app.post("/ipc", (req, res) => {
	// Handle IPC messages via HTTP
	const message = req.body
	// ... process message
	res.json({ success: true })
})

app.listen(3001, () => {
	console.log("🔧 [DEBUG] HTTP IPC server listening on port 3001")
})
```

## Immediate Actions Needed

**Please execute Step 1-4 above and report back:**

1. What debug logs appear in the Developer Console?
2. Does the socket file get created?
3. Any error messages in the console?
4. Does the CCS server connect successfully?

This information will determine the next phase of debugging.
