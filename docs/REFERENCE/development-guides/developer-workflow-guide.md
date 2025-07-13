# Developer Workflow Guide

## Feature 2: Remote UI Access for Roo

### Document Information

- **Repository**: tim-gameplan/Roo-Code
- **Date**: December 2024
- **Status**: Ready for Implementation

---

## 🎯 Overview

This guide provides step-by-step instructions for developers working on Feature 2: Remote UI Access for Roo. All development work is tracked through GitHub Issues to ensure visibility, accountability, and quality.

---

## 📋 Daily Workflow

### 1. Check Your Assigned Issues

**Start each day by checking your GitHub Issues:**

```bash
# View all open issues
gh issue list --state open

# View issues assigned to you
gh issue list --assignee @me --state open

# View specific issue details
gh issue view <issue-number>
```

**Or visit the web interface:**

- Go to https://github.com/tim-gameplan/Roo-Code/issues
- Filter by "Assigned to you" to see your current tasks
- Check issue priorities and dependencies

### 2. Update Issue Status

**When starting work on an issue:**

```bash
# Add "status/in-progress" label
gh issue edit <issue-number> --add-label "status/in-progress"

# Add a comment to indicate you're starting
gh issue comment <issue-number> --body "Starting work on this issue. ETA: [your estimate]"
```

**In the web interface:**

- Add the `status/in-progress` label
- Leave a comment with your progress plan

### 3. Link Commits to Issues

**Every commit should reference the related issue:**

```bash
# Commit format: Include issue number
git commit -m "feat: implement JWT authentication (#4)

- Add user registration endpoint
- Implement password hashing with bcrypt
- Add rate limiting middleware

Closes #4"
```

**Commit message conventions:**

- `feat:` for new features
- `fix:` for bug fixes
- `docs:` for documentation updates
- `test:` for test additions
- `refactor:` for code refactoring

### 4. Create Pull Requests

**When your work is ready for review:**

```bash
# Create PR with issue reference
gh pr create --title "feat: implement authentication system (#4)" \
  --body "Implements JWT-based authentication system as specified in #4

## Changes
- User registration and login endpoints
- JWT token generation and validation
- Password hashing with bcrypt
- Rate limiting for authentication
- Comprehensive test suite

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed

## Documentation
- [ ] API documentation updated
- [ ] README updated with setup instructions

Closes #4"
```

**PR Requirements:**

- Reference the issue number in title and description
- Use the provided PR template
- Include testing checklist
- Add reviewers from the team

---

## 💬 GitHub Discussions vs Issues

### When to Use GitHub Discussions

**Use GitHub Discussions for:**

- **Architecture discussions** and design decisions
- **General questions** about the project or implementation
- **Brainstorming sessions** for new features or approaches
- **Team announcements** and project updates
- **Knowledge sharing** and best practices
- **Troubleshooting help** when you're stuck
- **RFC (Request for Comments)** for major changes

### When to Use GitHub Issues

**Use GitHub Issues for:**

- **Specific tasks** with clear acceptance criteria
- **Bug reports** with reproduction steps
- **Feature requests** with defined requirements
- **Documentation updates** with specific scope
- **Milestone tracking** and progress monitoring

### Discussion Categories

**Available discussion categories:**

- **💡 Ideas** - Brainstorming and feature suggestions
- **🙋 Q&A** - Questions and answers about the project
- **📢 Announcements** - Project updates and team news
- **🛠️ General** - Open-ended discussions about the project
- **🏗️ Architecture** - Technical design discussions
- **📚 Show and tell** - Demos and progress sharing

### Discussion Workflow

```bash
# Create a new discussion
gh discussion create --title "Architecture: CCS Database Schema Design" \
  --body "I'd like to discuss the optimal database schema for the CCS...

## Current Proposal
[Describe your proposal]

## Questions
- Should we use separate tables for sessions and users?
- How should we handle session cleanup?

## Looking for feedback on:
- Performance implications
- Security considerations
- Scalability concerns" \
  --category "Architecture"

# List discussions
gh discussion list

# View a specific discussion
gh discussion view <discussion-number>
```

---

## 🏷️ Issue Management

### Understanding Issue Types

**Issue Labels and Their Meaning:**

| Label                 | Purpose            | Action Required                            |
| --------------------- | ------------------ | ------------------------------------------ |
| `type/milestone`      | Milestone tracking | Monitor progress, update status            |
| `type/feature`        | New functionality  | Implement according to acceptance criteria |
| `type/bug`            | Something broken   | Fix and add regression tests               |
| `type/documentation`  | Docs update        | Update relevant documentation              |
| `priority/high`       | Important work     | Prioritize in your workflow                |
| `status/in-progress`  | Currently working  | Update progress regularly                  |
| `status/blocked`      | Cannot proceed     | Identify and resolve blockers              |
| `status/needs-review` | Ready for review   | Request team review                        |

### Issue Workflow States

```
📋 Backlog → 🔍 Ready → 🚧 In Progress → 👀 Review → 🧪 Testing → ✅ Done
```

**Your responsibilities at each stage:**

1. **Ready**: Issue is assigned and ready to start
2. **In Progress**: You're actively working on it
3. **Review**: Code is complete, PR created, waiting for review
4. **Testing**: Code reviewed, ready for QA testing
5. **Done**: All work completed and merged

### Creating New Issues

**When you discover new work or bugs:**

```bash
# Create a new issue
gh issue create --title "[Component] Brief description" \
  --body "## Description
Detailed description of the issue or feature request.

## Acceptance Criteria
- [ ] Specific requirement 1
- [ ] Specific requirement 2

## Related Issues
- Related to #<issue-number>

## Definition of Done
- [ ] Code implemented and reviewed
- [ ] Tests written and passing
- [ ] Documentation updated" \
  --label "type/feature,priority/medium"
```

---

## 🔗 Linking Work to Documentation

### Requirements Traceability

**Every issue should link back to requirements:**

- **SRS Reference**: Link to specific SRS sections
- **Implementation Plan**: Reference the task from the implementation plan
- **API Specs**: Link to relevant API documentation
- **Architecture**: Reference system architecture components

**Example in issue description:**

```markdown
## Requirements Reference

- [ ] SRS Section: 3.2.1 (Central Communication Server)
- [ ] Implementation Plan Task: A1.1
- [ ] API Specification: Authentication Endpoints
- [ ] Architecture Component: CCS Authentication Module
```

### Documentation Updates

**When your code changes affect documentation:**

1. **Update relevant docs** in the same PR
2. **Create follow-up documentation issues** if major updates needed
3. **Link documentation PRs** to the original feature issue

---

## 🧪 Testing Requirements

### Test Coverage Expectations

**Every feature issue must include:**

- **Unit Tests**: Test individual functions and components
- **Integration Tests**: Test component interactions
- **API Tests**: Test endpoint functionality
- **Security Tests**: Test authentication and authorization

### Testing Workflow

```bash
# Run tests before committing
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:security

# Check test coverage
npm run test:coverage
```

**Test requirements in issues:**

- Minimum 80% code coverage
- All acceptance criteria covered by tests
- Security tests for authentication features
- Performance tests for critical paths

---

## 📊 Progress Reporting

### Weekly Updates

**Every Friday, update your issues with progress:**

```bash
# Add progress comment to active issues
gh issue comment <issue-number> --body "## Weekly Progress Update

### Completed This Week
- [x] Task 1 completed
- [x] Task 2 completed

### In Progress
- [ ] Task 3 (50% complete)
- [ ] Task 4 (just started)

### Blockers
- Waiting for API specification clarification (#<issue-number>)

### Next Week Plan
- Complete Task 3
- Start Task 5
- Review PR for Task 2"
```

### Milestone Tracking

**Contribute to milestone progress:**

- Update milestone issues with your progress
- Report blockers that affect milestone timeline
- Participate in milestone review meetings

---

## 🚨 Common Scenarios

### When You're Blocked

1. **Update the issue** with `status/blocked` label
2. **Comment on the blocking issue** or create one if it doesn't exist
3. **Notify the team** in Slack or team channel
4. **Work on other issues** while waiting for resolution

### When Requirements Are Unclear

1. **Comment on the issue** asking for clarification
2. **Reference specific documentation** that needs clarification
3. **Tag relevant team members** who can provide answers
4. **Don't start coding** until requirements are clear

### When You Find Bugs

1. **Create a bug issue** immediately
2. **Link it to the feature issue** you're working on
3. **Add `priority/high`** if it blocks your work
4. **Include reproduction steps** and environment details

---

## 🔧 Tools and Commands

### Essential GitHub CLI Commands

```bash
# Issue management
gh issue list                          # List all issues
gh issue view <number>                 # View issue details
gh issue edit <number> --add-label     # Add labels
gh issue comment <number> --body       # Add comments

# Pull request management
gh pr create                           # Create new PR
gh pr list                            # List PRs
gh pr view <number>                   # View PR details
gh pr review <number>                 # Review a PR

# Repository navigation
gh repo view                          # View repo details
gh browse                            # Open repo in browser
gh browse issues                     # Open issues page
```

### VS Code Extensions

**Recommended extensions for GitHub integration:**

- **GitHub Pull Requests and Issues**: Manage issues and PRs from VS Code
- **GitLens**: Enhanced Git capabilities
- **GitHub Copilot**: AI-powered code assistance

---

## 📚 Resources

### Documentation Links

- [Feature 2 SRS](./feature-2-remote-ui-srs.md) - Complete requirements
- [Implementation Plan](./feature-2-implementation-plan.md) - Development roadmap
- [API Specifications](./feature-2-api-specifications.md) - API documentation
- [System Architecture](./system-architecture.md) - Technical design

### GitHub Resources

- [GitHub Issues](https://github.com/tim-gameplan/Roo-Code/issues) - All project issues
- [GitHub Discussions](https://github.com/tim-gameplan/Roo-Code/discussions) - Team collaboration and Q&A
- [GitHub Projects](https://github.com/tim-gameplan/Roo-Code/projects) - Project boards
- [Pull Requests](https://github.com/tim-gameplan/Roo-Code/pulls) - Code reviews

### Team Communication

- **Slack Channel**: #feature-2-remote-ui
- **Daily Standups**: 9:00 AM EST
- **Sprint Reviews**: Every 2 weeks
- **Retrospectives**: End of each phase

---

## ✅ Quick Checklist

### Before Starting Work

- [ ] Issue is assigned to you
- [ ] Requirements are clear
- [ ] Dependencies are resolved
- [ ] You understand the acceptance criteria

### During Development

- [ ] Update issue status to "in-progress"
- [ ] Commit regularly with issue references
- [ ] Write tests as you code
- [ ] Update documentation as needed

### Before Creating PR

- [ ] All tests pass
- [ ] Code follows project standards
- [ ] Documentation is updated
- [ ] Issue acceptance criteria are met

### After PR Merge

- [ ] Close the related issue
- [ ] Update milestone progress
- [ ] Clean up local branches
- [ ] Move to next priority issue

---

This workflow ensures that all development work is properly tracked, documented, and coordinated with the team. Following these guidelines will help maintain high code quality and project visibility throughout the Feature 2 implementation.
