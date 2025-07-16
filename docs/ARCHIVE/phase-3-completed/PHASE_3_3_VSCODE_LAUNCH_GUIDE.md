# Phase 3.3 - VSCode Launch Guide for Development Roo-Code Extension

**Date:** July 1, 2025  
**Status:** ✅ **READY FOR REAL-WORLD TESTING**  
**Build Status:** ✅ **COMPLETED SUCCESSFULLY**

## 🚀 Quick Start - Launch VSCode with Development Extension

### Method 1: VSCode Debug Launch (Recommended)

1. **Open the Roo-Code project in VSCode:**

    ```bash
    code /Users/tim/gameplan/vibing/noo-code/Roo-Code
    ```

2. **Launch Extension Development Host:**
    - Press `F5` or go to **Run > Start Debugging**
    - Select "Run Extension" from the debug configuration
    - A new VSCode window will open with the development extension loaded

### Method 2: Manual Launch Steps

```bash
# 1. Ensure build is complete
pnpm run build

# 2. Launch VSCode with extension development host
code --extensionDevelopmentPath=/Users/tim/gameplan/vibing/noo-code/Roo-Code
```

### Method 3: VSCode Extension Development Host

1. Open VSCode
2. Press `F5` or go to **Run > Start Debugging**
3. Select "Launch Extension" from the debug configuration
4. A new VSCode window will open with the development extension loaded

## 🔧 Pre-Launch Checklist

### ✅ Infrastructure Requirements

- [x] **Build Status:** Extension built successfully (93ms turbo build)
- [x] **CCS Server:** Running and healthy on port 3001
- [x] **Database:** PostgreSQL connected and operational
- [x] **Redis:** Connected and operational
- [x] **Node Version:** v23.4.0 (compatible)

### ✅ Verify CCS Server Status

```bash
# Check if CCS server is running
curl http://localhost:3001/health

# Expected response:
# {
#   "status": "healthy",
#   "timestamp": "2025-07-01T22:08:11.504Z",
#   "version": "1.0.0",
#   "uptime": 346153,
#   "services": {
#     "database": "connected",
#     "redis": "connected",
#     "extension": "connected"
#   }
# }
```

### ✅ Start CCS Server (if not running)

```bash
# Navigate to production-ccs directory
cd production-ccs

# Start the development server
pnpm run dev

# Server will start on http://localhost:3001
```

## 🎯 Extension Launch Verification

### 1. Extension Activation Check

Once VSCode launches with the development extension:

1. **Check Extension Status:**

    - Open Command Palette (`Cmd+Shift+P`)
    - Look for "Roo-Code" commands
    - Verify extension appears in Extensions panel

2. **Verify Extension Loading:**
    - Check VSCode Developer Console (`Help > Toggle Developer Tools`)
    - Look for Roo-Code extension activation logs
    - Confirm no error messages during startup

### 2. CCS Connection Validation

1. **Open Roo-Code Panel:**

    - Click Roo-Code icon in Activity Bar (left sidebar)
    - Or use Command Palette: "Roo-Code: Open"

2. **Check Connection Status:**
    - Look for connection indicator in Roo-Code panel
    - Verify "Connected to CCS" status message
    - Check for real-time communication indicators

### 3. Core Functionality Test

1. **Test Basic Commands:**

    - Try opening a file
    - Test basic conversation functionality
    - Verify UI responsiveness

2. **Test Cross-Device Features:**
    - Check device registration
    - Test message synchronization
    - Verify file sync capabilities

## 🔍 Troubleshooting Common Issues

### Issue 1: Extension Not Loading

**Symptoms:** Extension doesn't appear in VSCode
**Solutions:**

```bash
# Rebuild the extension
pnpm run build

# Clear VSCode extension cache
rm -rf ~/.vscode/extensions/roo-code*

# Restart VSCode with clean profile
code --disable-extensions --extensionDevelopmentPath=/Users/tim/gameplan/vibing/noo-code/Roo-Code
```

### Issue 2: CCS Connection Failed

**Symptoms:** "Failed to connect to CCS" error
**Solutions:**

```bash
# Check CCS server status
curl http://localhost:3001/health

# Restart CCS server
cd production-ccs
pnpm run dev

# Check firewall/network settings
lsof -i :3001
```

### Issue 3: Extension Crashes

**Symptoms:** Extension stops responding or crashes
**Solutions:**

1. Check VSCode Developer Console for errors
2. Review extension logs in Output panel
3. Restart VSCode Extension Development Host
4. Check for TypeScript compilation errors

### Issue 4: WebSocket Connection Issues

**Symptoms:** Real-time features not working
**Solutions:**

```bash
# Test WebSocket connection directly
node test-websocket-connection.js

# Check CCS WebSocket endpoint
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" http://localhost:3001/ws
```

## 📊 Debug Mode Configuration

### Enable Extension Debug Logging

1. Open VSCode Settings (`Cmd+,`)
2. Search for "roo-code"
3. Enable "Debug Mode" if available
4. Set log level to "Debug" or "Verbose"

### CCS Server Debug Mode

```bash
# Start CCS server with debug logging
cd production-ccs
DEBUG=* pnpm run dev

# Or with specific debug namespaces
DEBUG=roo-code:* pnpm run dev
```

### VSCode Extension Development Tools

1. **Developer Console:** `Help > Toggle Developer Tools`
2. **Extension Host Log:** `View > Output > Extension Host`
3. **Debug Console:** Available when debugging extension
4. **Network Tab:** Monitor CCS communication

## 🎯 Success Criteria Validation

### ✅ Extension Launch Success

- [ ] VSCode opens with development extension loaded
- [ ] Extension appears in Extensions panel
- [ ] No error messages in Developer Console
- [ ] Extension commands available in Command Palette

### ✅ CCS Integration Success

- [ ] Extension connects to CCS server successfully
- [ ] Connection status shows "Connected"
- [ ] Real-time communication functional
- [ ] WebSocket connection stable

### ✅ Core Functionality Success

- [ ] Roo-Code panel opens and displays correctly
- [ ] Basic conversation interface responsive
- [ ] File operations working
- [ ] UI components render properly

### ✅ Cross-Device Features Success

- [ ] Device registration successful
- [ ] Message synchronization working
- [ ] File sync operational
- [ ] Multi-device communication active

## 📋 Next Steps After Launch

### Phase 3.3 Testing Execution

1. **Follow Testing Guide:** `docs/PHASE_3_3_NEXT_STEPS_TESTING_GUIDE.md`
2. **Execute Test Scenarios:** Run through all test cases
3. **Document Results:** Record findings and issues
4. **Performance Validation:** Measure actual vs. target metrics

### Real-World Usage Testing

1. **Create Test Workspace:** Set up realistic development environment
2. **Multi-Device Testing:** Test across different devices/platforms
3. **Extended Usage:** Run extension for extended periods
4. **Stress Testing:** Test with large files and heavy usage

## 🎯 Ready for Phase 3.3 Execution

The development Roo-Code extension is now **fully prepared and ready for real-world testing** with:

- ✅ **Successful build completion** (93ms turbo build)
- ✅ **CCS server operational** and healthy
- ✅ **Infrastructure validated** and ready
- ✅ **Comprehensive launch procedures** documented
- ✅ **Troubleshooting framework** in place
- ✅ **Debug tools configured** and available

**Execute the launch command and begin Phase 3.3 real-world testing!**

---

**Primary Launch Method:**

1. Open VSCode: `code /Users/tim/gameplan/vibing/noo-code/Roo-Code`
2. Press `F5` or go to **Run > Start Debugging**
3. Select "Run Extension" from the debug configuration

**Alternative Command Line:**

```bash
code --extensionDevelopmentPath=/Users/tim/gameplan/vibing/noo-code/Roo-Code/src
```
