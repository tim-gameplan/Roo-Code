---
name: RCCS First Run Testing Issue
about: Report issues found during RCCS first-time testing
title: "[TESTING] "
labels: ["first-run-testing", "testing"]
assignees: ""
---

## 🧪 Testing Context

**Testing Phase:**

- [ ] Phase 1: Infrastructure Validation
- [ ] Phase 2: Core Functionality
- [ ] Phase 3: Integration Testing
- [ ] Phase 4: Advanced Testing & Edge Cases

**Testing Step:** [e.g., Step 1.2: Production CCS Server Startup]

**Branch:** `first-run-testing`

---

## 🐛 Issue Description

**Brief Summary:**
[Provide a clear, concise description of the issue]

**Component Affected:**

- [ ] Docker Infrastructure
- [ ] Production CCS Server
- [ ] Database (PostgreSQL)
- [ ] Cache (Redis)
- [ ] WebSocket Communication
- [ ] REST API
- [ ] VS Code Extension Integration
- [ ] Authentication System
- [ ] File Management
- [ ] Real-time Messaging
- [ ] Other: [specify]

---

## 🔄 Steps to Reproduce

1. [First step]
2. [Second step]
3. [Third step]
4. [Additional steps as needed]

**Command/Action that triggered the issue:**

```bash
[paste the exact command or describe the action]
```

---

## 📋 Expected vs Actual Behavior

**Expected Behavior:**
[What should have happened]

**Actual Behavior:**
[What actually happened]

**Error Messages/Logs:**

```
[Paste any error messages, stack traces, or relevant log output]
```

---

## 🖥️ Environment Details

**Operating System:** [e.g., macOS 14.5, Ubuntu 22.04, Windows 11]

**Software Versions:**

- Node.js: [version]
- pnpm: [version]
- Docker: [version]
- Docker Compose: [version]
- Browser (if applicable): [browser and version]

**System Resources:**

- Available RAM: [amount]
- Available Disk Space: [amount]
- CPU: [type and cores]

---

## 🔍 Additional Context

**Screenshots:**
[Attach any relevant screenshots]

**Related Files:**
[List any configuration files, logs, or code files that might be relevant]

**Network Configuration:**
[Any relevant network setup, ports, firewalls, etc.]

**Previous Working State:**

- [ ] This worked in a previous test session
- [ ] This is the first time testing this functionality
- [ ] This worked in the POC but not in production setup

---

## 🚨 Priority Assessment

**Impact Level:**

- [ ] Critical - Blocks all testing progress
- [ ] High - Blocks major functionality testing
- [ ] Medium - Workaround available, but affects testing efficiency
- [ ] Low - Minor issue, doesn't significantly impact testing

**Urgency:**

- [ ] Immediate - Need to resolve today
- [ ] High - Need to resolve within 1-2 days
- [ ] Medium - Can wait a few days
- [ ] Low - Can be addressed later

---

## 🛠️ Attempted Solutions

**What I've tried:**

- [ ] Restarted Docker services
- [ ] Cleared Docker volumes/images
- [ ] Reinstalled dependencies
- [ ] Checked configuration files
- [ ] Reviewed logs for additional context
- [ ] Searched existing issues/documentation
- [ ] Other: [describe]

**Workaround Found:**

- [ ] Yes: [describe the workaround]
- [ ] No: [explain what was attempted]

---

## 📚 Documentation Impact

**Documentation Updates Needed:**

- [ ] Update test plan with new steps
- [ ] Add troubleshooting section
- [ ] Update environment setup instructions
- [ ] Add known issues documentation
- [ ] Update FAQ
- [ ] No documentation changes needed

---

## 🔗 Related Issues/PRs

**Related GitHub Issues:**
[Link any related issues]

**Related Documentation:**

- [Test Plan Section](../docs/RCCS_FIRST_RUN_TEST_PLAN.md#relevant-section)
- [Other relevant docs]

---

## ✅ Definition of Done

**This issue will be considered resolved when:**

- [ ] The reported problem is fixed
- [ ] The fix has been tested and verified
- [ ] Documentation is updated (if needed)
- [ ] Test progress can continue without workarounds
- [ ] No regression in other functionality

---

## 📝 Testing Notes

**For Testing Team:**
[Any additional notes for other testers or future reference]

**Follow-up Actions:**
[Any actions that should be taken after this issue is resolved]

---

**Issue Created:** [Date]  
**Tester:** [Your GitHub username]  
**Test Session:** [Link to current test session documentation]
