# Roo Code Development Setup Guide

**Date:** 2025-06-21  
**Purpose:** Complete guide for running Roo Code in development mode to test local changes

## 🎯 Overview

This guide addresses the common issue where developers have Roo Code installed from the marketplace but need to run their local development version to test changes, particularly for features like the Remote UI IPC integration.

## 🔧 Development Setup Options

### Option 1: VS Code Extension Development Host (Recommended)

This is the standard VS Code extension development approach that creates an isolated environment.

#### Steps:

1. **Clone and Setup:**
```bash
git clone https://github.com/RooCodeInc/Roo-Code.git
cd Roo-Code
pnpm install
```

2. **Open in VS Code:**
```bash
code .
```

3. **Start Development Mode:**
   - Press `F5` (or **Run** → **Start Debugging**)
   - This opens a new "Extension Development Host" window
   - The new window runs your local development version
   - The original window continues running the installed version

4. **Verify Development Mode:**
   - In the Extension Development Host window, check the Roo Code sidebar
   - Look for any debug output or console logs
   - The extension will use your local source code changes

#### Benefits:
- ✅ Isolated environment - no conflicts with installed version
- ✅ Automatic reload on changes (for webview)
- ✅ Full debugging capabilities
- ✅ Extension host restart for core changes

### Option 2: Build and Install Local VSIX

This replaces the marketplace version with your local build.

#### Steps:

1. **Build VSIX Package:**
```bash
cd Roo-Code
pnpm install
pnpm vsix
```

2. **Uninstall Marketplace Version:**
   - Open VS Code Extensions panel (`Cmd+Shift+X`)
   - Find "Roo Code" extension
   - Click gear icon → "Uninstall"
   - Restart VS Code

3. **Install Local VSIX:**
```bash
code --install-extension bin/roo-cline-*.vsix
```

4. **Restart VS Code:**
   - Close and reopen VS Code
   - Your local version is now active

#### Benefits:
- ✅ Runs in normal VS Code environment
- ✅ Persistent until you reinstall marketplace version
- ❌ Requires rebuild for each change

### Option 3: Disable Marketplace Extension

Temporarily disable the installed version to avoid conflicts.

#### Steps:

1. **Disable Marketplace Extension:**
   - Open Extensions panel (`Cmd+Shift+X`)
   - Find "Roo Code" extension
   - Click gear icon → "Disable"

2. **Run Development Version:**
   - Follow Option 1 steps (F5 development host)
   - Or use Option 2 (build and install VSIX)

3. **Re-enable When Done:**
   - Re-enable marketplace extension when finished developing

## 🧪 Testing IPC Integration

Once you have the development version running, test the IPC integration:

### 1. Verify Extension Activation

```bash
# Check if socket is created
ls -la /tmp/app.roo-extension

# If not found, trigger extension activation:
# - Open Roo Code sidebar
# - Start a new task
# - Execute any Roo Code command
```

### 2. Test IPC Connection

```bash
# Test socket connectivity
echo '{"type": "getStatus"}' | nc -U /tmp/app.roo-extension

# Expected response:
# {"success": true, "status": {"hasActiveTask": false, "taskId": null, "isStreaming": false}}
```

### 3. Run Phase 2 Tests

```bash
cd poc-remote-ui
node testing/phase2-extension-integration.js
```

Expected output after IPC activation:
```
✅ IPC Connection: Connected to /tmp/app.roo-extension
✅ End-to-End Flow: Full communication chain functional
```

## 🔍 Troubleshooting

### Issue: Extension Not Activating

**Symptoms:** Socket file `/tmp/app.roo-extension` not created

**Solutions:**
1. **Trigger Activation:**
   - Open Roo Code sidebar in VS Code
   - Click "New Task" button
   - Execute any Roo Code command from Command Palette

2. **Check Extension Host:**
   - In Extension Development Host, open Developer Tools (`Cmd+Shift+I`)
   - Check Console for errors
   - Look for "Remote UI IPC server listening" message

3. **Manual Activation:**
   - Open Command Palette (`Cmd+Shift+P`)
   - Type "Roo Code" and execute any command
   - This should trigger extension activation

### Issue: Multiple Versions Conflict

**Symptoms:** Unexpected behavior, wrong version running

**Solutions:**
1. **Use Extension Development Host (Option 1)**
   - Provides complete isolation
   - No conflicts with installed version

2. **Disable Marketplace Version:**
   - Extensions panel → Roo Code → Disable
   - Restart VS Code

### Issue: Changes Not Reflected

**Symptoms:** Code changes don't appear in running extension

**Solutions:**
1. **For Webview Changes:**
   - Changes appear automatically in Extension Development Host

2. **For Core Extension Changes:**
   - Stop debugging (`Shift+F5`)
   - Restart debugging (`F5`)
   - Or use "Restart Extension Host" command

3. **For VSIX Installation:**
   - Rebuild: `pnpm vsix`
   - Reinstall: `code --install-extension bin/roo-cline-*.vsix`
   - Restart VS Code

## 📋 Development Workflow

### Recommended Workflow for IPC Development:

1. **Setup Development Environment:**
```bash
git clone https://github.com/RooCodeInc/Roo-Code.git
cd Roo-Code
pnpm install
code .
```

2. **Start Development Mode:**
   - Press `F5` to open Extension Development Host
   - Wait for extension to load

3. **Activate IPC Handler:**
   - In Extension Development Host, open Roo Code sidebar
   - Start a new task or execute Roo Code command
   - Verify socket creation: `ls -la /tmp/app.roo-extension`

4. **Test IPC Integration:**
```bash
cd poc-remote-ui
node testing/phase2-extension-integration.js
```

5. **Develop and Test:**
   - Make changes to extension code
   - For webview: Changes appear automatically
   - For core: Restart Extension Host (`Shift+F5` then `F5`)
   - Re-test IPC functionality

6. **End-to-End Testing:**
```bash
# Start CCS server
cd poc-remote-ui && npm start

# In browser: http://localhost:3000
# Send test message and verify task creation in VS Code
```

## 🚀 Next Steps

After successful development setup:

1. **Verify IPC Integration:** Confirm socket creation and connectivity
2. **Run Complete Test Suite:** Execute both Phase 1 and Phase 2 tests
3. **End-to-End Validation:** Test full mobile-to-desktop communication flow
4. **Development Iteration:** Make changes and test incrementally

## 📚 Additional Resources

- **VS Code Extension Development:** [Official Guide](https://code.visualstudio.com/api/get-started/your-first-extension)
- **Roo Code Contributing:** [CONTRIBUTING.md](../CONTRIBUTING.md)
- **Project Documentation:** [docs/README.md](README.md)
- **IPC Implementation:** [src/core/webview/ClineProvider.ts](../src/core/webview/ClineProvider.ts) (lines 1847-1910)

---

## 🎉 Success Criteria

You'll know the development setup is working when:

- ✅ Extension Development Host opens with your local version
- ✅ Socket file `/tmp/app.roo-extension` is created
- ✅ IPC connection test returns valid JSON response
- ✅ Phase 2 tests show "Connected to /tmp/app.roo-extension"
- ✅ End-to-end communication flow works from browser to VS Code

This setup enables full development and testing of the Remote UI IPC integration with your local Roo Code changes.
