# TASK-007.2.1 REST API Endpoints - GitHub Issues Creation Guide

## Overview

This document provides the exact GitHub issue content for creating 8 structured issues for the REST API implementation. Each issue includes proper linking, dependencies, and organization.

## Repository Information

- **Repository**: Roo-Code (or the correct repository name)
- **Epic**: Cross-Device Communication System
- **Milestone**: Database Integration & API Layer

## Issue Creation Instructions

### Step 1: Create Milestones

Create these milestones in GitHub first:

1. **API Foundation** (Target: Week 1)
2. **Core API Layer** (Target: Week 2)
3. **Advanced Features** (Target: Week 3)
4. **Production Ready** (Target: Week 4)

### Step 2: Create Labels

Create these labels in GitHub:

- `priority:critical` (red)
- `priority:high` (orange)
- `priority:medium` (yellow)
- `priority:low` (green)
- `type:infrastructure` (blue)
- `type:api` (purple)
- `type:auth` (pink)
- `type:crud` (cyan)
- `type:advanced` (brown)
- `epic:rest-api` (dark blue)
- `milestone:foundation` (light blue)
- `milestone:core-api` (light green)
- `milestone:advanced` (light orange)
- `milestone:production` (light purple)

---

## Issue #1: Express App Integration & Core Infrastructure

**Title**: `[TASK-007.2.1.1] Express App Integration & Core Infrastructure`

**Labels**: `priority:critical`, `type:infrastructure`, `epic:rest-api`, `milestone:foundation`

**Milestone**: API Foundation

**Assignees**: Backend Team

**Body**:

````markdown
## Overview

Set up the main Express application with core infrastructure components to enable testing and deployment of the REST API.

## Priority

🔴 **Critical** | **Estimated Time**: 4-6 hours | **Assignee**: Backend Team

## Acceptance Criteria

- [ ] Express app configuration with TypeScript
- [ ] Route integration for all middleware and auth routes
- [ ] CORS configuration and security headers
- [ ] Global error handling middleware
- [ ] Request logging and monitoring setup
- [ ] Health check endpoints (`/health`, `/ready`)
- [ ] Environment-based configuration
- [ ] Docker integration with existing infrastructure

## Dependencies

- ✅ Requires: Docker infrastructure (TASK-007.0) - Complete
- ✅ Requires: Database services (TASK-007.1.1) - Complete
- 🚫 Blocks: All subsequent API implementation issues

## Technical Tasks

```typescript
// Main components to implement:
- src/app.ts - Express application setup
- src/server.ts - Server startup and configuration
- src/middleware/error-handler.ts - Global error handling
- src/middleware/cors.ts - CORS configuration
- src/middleware/logging.ts - Request logging
- src/routes/index.ts - Route aggregation
- src/routes/health.ts - Health check endpoints
```
````

## Files to Create/Modify

- `production-ccs/src/app.ts`
- `production-ccs/src/server.ts`
- `production-ccs/src/middleware/error-handler.ts`
- `production-ccs/src/middleware/cors.ts`
- `production-ccs/src/middleware/logging.ts`
- `production-ccs/src/routes/index.ts`
- `production-ccs/src/routes/health.ts`

## Related Documentation

- [TASK-007.2.1 Main Specification](./docs/tasks/TASK_007_2_1_REST_API_ENDPOINTS.md)
- [GitHub Issues Breakdown](./docs/tasks/TASK_007_2_1_GITHUB_ISSUES_BREAKDOWN.md)
- [Docker Infrastructure Setup](./docs/tasks/TASK_007_0_DOCKER_INFRASTRUCTURE.md)

## Definition of Done

- [ ] Express server starts successfully
- [ ] Health endpoints return 200 status
- [ ] CORS headers properly configured
- [ ] Error handling middleware catches all errors
- [ ] Request logging captures all API calls
- [ ] Docker integration verified
- [ ] Code review completed
- [ ] Tests passing

````

---

## Issue #2: Authentication Database Integration

**Title**: `[TASK-007.2.1.2] Replace Auth Mock Responses with Database Integration`

**Labels**: `priority:high`, `type:auth`, `epic:rest-api`, `milestone:foundation`

**Milestone**: API Foundation

**Assignees**: Backend Team

**Body**:
```markdown
## Overview
Replace mock responses in authentication routes with actual database service calls using the existing auth service and database schema.

## Priority
🟠 **High** | **Estimated Time**: 4-6 hours | **Assignee**: Backend Team

## Acceptance Criteria
- [ ] Replace all mock responses in `/api/auth/*` endpoints
- [ ] Integrate with existing AuthService and DatabaseService
- [ ] Implement proper password hashing and validation
- [ ] JWT token generation and validation with database sessions
- [ ] Email verification workflow with database storage
- [ ] Error handling for database connection issues
- [ ] Rate limiting integration with user-specific limits
- [ ] Session management with database persistence

## Dependencies
- 🔄 Requires: Issue #1 (Express App Setup)
- ✅ Requires: Database schema (TASK-007.1.1.1) - Complete
- ✅ Requires: Auth service (TASK-007.1.1.1) - Complete

## Related Issues
- Links to: TASK-007.1.1.1 (User Authentication Schema)
- Links to: Auth middleware implementation ✅ Complete

## Technical Tasks
```typescript
// Integration points:
- Update src/routes/auth.ts with real database calls
- Enhance AuthService integration
- Implement session persistence
- Add email verification storage
- Update JWT payload with database user data
````

## Testing Requirements

- [ ] Unit tests for all auth endpoints
- [ ] Integration tests with database
- [ ] Authentication flow end-to-end tests
- [ ] Rate limiting validation tests

## Definition of Done

- [ ] All auth endpoints use real database
- [ ] Password hashing implemented
- [ ] JWT tokens properly generated/validated
- [ ] Email verification functional
- [ ] Session persistence working
- [ ] Rate limiting operational
- [ ] All tests passing
- [ ] Code review completed

````

---

## Issue #3: User Management API Implementation

**Title**: `[TASK-007.2.1.3] User Management API Endpoints`

**Labels**: `priority:high`, `type:crud`, `epic:rest-api`, `milestone:core-api`

**Milestone**: Core API Layer

**Assignees**: Backend Team

**Body**:
```markdown
## Overview
Implement comprehensive user management endpoints for profile management, preferences, and device management.

## Priority
🟠 **High** | **Estimated Time**: 6-8 hours | **Assignee**: Backend Team

## Acceptance Criteria
- [ ] `GET /api/users/profile` - Get user profile
- [ ] `PUT /api/users/profile` - Update user profile
- [ ] `GET /api/users/preferences` - Get user preferences
- [ ] `PUT /api/users/preferences` - Update user preferences
- [ ] `GET /api/users/devices` - List user devices
- [ ] `POST /api/users/devices` - Register new device
- [ ] `PUT /api/users/devices/:id` - Update device info
- [ ] `DELETE /api/users/devices/:id` - Remove device
- [ ] `POST /api/users/change-password` - Change password
- [ ] Proper validation for all endpoints
- [ ] Rate limiting per endpoint type

## Dependencies
- 🔄 Requires: Issue #1 (Express App Setup)
- 🔄 Requires: Issue #2 (Auth Database Integration)
- ✅ Requires: User schema (TASK-007.1.1.1) - Complete

## Related Issues
- Links to: TASK-007.1.1.1 (User Authentication Schema)
- Links to: Validation middleware ✅ Complete

## API Endpoints
````

GET /api/users/profile
PUT /api/users/profile
GET /api/users/preferences
PUT /api/users/preferences
GET /api/users/devices
POST /api/users/devices
PUT /api/users/devices/:id
DELETE /api/users/devices/:id
POST /api/users/change-password

````

## Technical Tasks
```typescript
// Files to create:
- src/routes/workspaces.ts - Workspace routes
- src/controllers/workspaces.ts - Workspace business logic
- src/services/workspace-permissions.ts - Access control
````

## Definition of Done

- [ ] All 8 workspace endpoints implemented
- [ ] Proper authorization implemented
- [ ] Permissions system working
- [ ] Member management functional
- [ ] Settings management operational
- [ ] Unit tests written
- [ ] Integration tests passing
- [ ] API documentation updated

````

---

## Issue #7: File Synchronization API Implementation

**Title**: `[TASK-007.2.1.7] File Synchronization API with Conflict Resolution`

**Labels**: `priority:medium`, `type:advanced`, `epic:rest-api`, `milestone:advanced`

**Milestone**: Advanced Features

**Assignees**: Backend Team

**Body**:
```markdown
## Overview
Implement file synchronization endpoints with conflict detection and resolution capabilities.

## Priority
🟡 **Medium** | **Estimated Time**: 8-10 hours | **Assignee**: Backend Team

## Acceptance Criteria
- [ ] `GET /api/workspaces/:id/files` - List workspace files
- [ ] `POST /api/workspaces/:id/files` - Upload/sync new file
- [ ] `GET /api/workspaces/:id/files/:path` - Get file content
- [ ] `PUT /api/workspaces/:id/files/:path` - Update file content
- [ ] `DELETE /api/workspaces/:id/files/:path` - Delete file
- [ ] `GET /api/workspaces/:id/files/:path/history` - Get file history
- [ ] `POST /api/workspaces/:id/files/:path/resolve-conflict` - Resolve conflicts
- [ ] `GET /api/workspaces/:id/sync-status` - Get sync status
- [ ] Conflict detection and resolution strategies
- [ ] File versioning and history tracking
- [ ] Efficient diff algorithms for large files

## Dependencies
- 🔄 Requires: Issue #1 (Express App Setup)
- 🔄 Requires: Issue #6 (Workspace Management)
- ✅ Requires: File sync schema (TASK-007.1.1.3) - Complete

## Related Issues
- Links to: TASK-007.1.1.3 (File Sync Workspace Schema)
- Links to: File sync services ✅ Complete
- Links to: Issue #6 (Workspace Management)

## API Endpoints
````

GET /api/workspaces/:id/files
POST /api/workspaces/:id/files
GET /api/workspaces/:id/files/:path
PUT /api/workspaces/:id/files/:path
DELETE /api/workspaces/:id/files/:path
GET /api/workspaces/:id/files/:path/history
POST /api/workspaces/:id/files/:path/resolve-conflict
GET /api/workspaces/:id/sync-status

````

## Technical Tasks
```typescript
// Files to create:
- src/routes/file-sync.ts - File sync routes
- src/controllers/file-sync.ts - File sync business logic
- src/services/conflict-resolution.ts - Conflict handling
- src/services/file-versioning.ts - Version management
- src/services/file-diff.ts - Diff algorithms
````

## Definition of Done

- [ ] All 8 file sync endpoints implemented
- [ ] Conflict detection working
- [ ] Resolution strategies operational
- [ ] File versioning functional
- [ ] History tracking working
- [ ] Diff algorithms efficient
- [ ] Unit tests written
- [ ] Integration tests passing

````

---

## Issue #8: API Documentation & Testing Infrastructure

**Title**: `[TASK-007.2.1.8] API Documentation & Comprehensive Testing`

**Labels**: `priority:medium`, `type:infrastructure`, `epic:rest-api`, `milestone:production`

**Milestone**: Production Ready

**Assignees**: Backend Team

**Body**:
```markdown
## Overview
Create comprehensive API documentation and testing infrastructure for all endpoints.

## Priority
🟡 **Medium** | **Estimated Time**: 6-8 hours | **Assignee**: Backend Team

## Acceptance Criteria
- [ ] OpenAPI/Swagger documentation for all endpoints
- [ ] Interactive API explorer setup
- [ ] Comprehensive integration tests for all endpoints
- [ ] Performance testing and benchmarking
- [ ] API usage examples and tutorials
- [ ] Postman collection for manual testing
- [ ] CI/CD integration for automated testing
- [ ] API versioning strategy documentation
- [ ] Error response documentation
- [ ] Authentication flow documentation

## Dependencies
- 🔄 Requires: All previous issues (1-7) to be completed
- 🔄 Requires: Testing infrastructure setup

## Related Issues
- Links to: All API implementation issues (1-7)
- Links to: CI/CD pipeline setup

## Technical Tasks
```typescript
// Files to create:
- docs/api/openapi.yaml - OpenAPI specification
- docs/api/examples/ - API usage examples
- src/docs/swagger.ts - Swagger setup
- tests/integration/ - Integration test suites
- tests/performance/ - Performance benchmarks
- postman/collections/ - Postman collections
````

## Deliverables

- [ ] Complete OpenAPI 3.0 specification
- [ ] Interactive Swagger UI at `/api/docs`
- [ ] Comprehensive test coverage reports
- [ ] Performance benchmarking results
- [ ] API usage tutorials and examples

## Definition of Done

- [ ] 100% endpoint documentation coverage
- [ ] Interactive API explorer functional
- [ ] > 95% test coverage achieved
- [ ] Performance benchmarks completed
- [ ] Postman collections created
- [ ] CI/CD integration working
- [ ] Usage examples documented
- [ ] Error responses documented

```

---

## Project Board Setup

### GitHub Project Board Configuration

**Board Name**: `REST API Implementation - TASK-007.2.1`

**Columns**:
1. **📋 Backlog**
   - All issues start here
   - Prioritized by dependencies

2. **🏗️ In Progress**
   - Issues currently being worked on
   - Limit: 2-3 issues max

3. **👀 Review**
   - Code review and testing phase
   - PR created and under review

4. **✅ Done**
   - Completed and merged
   - All acceptance criteria met

### Issue Assignment Strategy

**Phase 1 (Week 1)**: Foundation
- Assign Issue #1 to senior backend developer
- Assign Issue #2 to backend developer with auth experience

**Phase 2 (Week 2)**: Core APIs
- Assign Issue #3 to backend developer (user management)
- Assign Issue #4 to backend developer (conversation systems)

**Phase 3 (Week 3)**: Advanced Features
- Assign Issue #5 to developer with messaging experience
- Assign Issue #6 to developer with workspace/project management experience
- Assign Issue #7 to senior developer (complex file sync logic)

**Phase 4 (Week 4)**: Documentation & Testing
- Assign Issue #8 to developer with documentation/testing expertise

### Automation Rules

**Auto-move to "In Progress"**:
- When issue is assigned
- When first commit references issue

**Auto-move to "Review"**:
- When PR is created
- When issue is marked as ready for review

**Auto-move to "Done"**:
- When PR is merged
- When all acceptance criteria are checked

### Communication Plan

**Daily Standups**:
- Progress on current issues
- Blockers and dependencies
- Next day priorities

**Weekly Reviews**:
- Milestone progress assessment
- Risk identification and mitigation
- Resource allocation adjustments

**Issue Updates**:
- Comment on progress every 2 days
- Update acceptance criteria as completed
- Tag dependencies when unblocked

## Success Metrics Dashboard

### Technical KPIs
- **Issues Completed**: Target 2 per week
- **Code Coverage**: Maintain >95%
- **Response Time**: <200ms for 95% of endpoints
- **Bug Rate**: <5% of completed features

### Process KPIs
- **Cycle Time**: Average time from start to completion
- **Lead Time**: Time from creation to deployment
- **Review Time**: Time spent in code review
- **Rework Rate**: Issues requiring significant changes

## Risk Management

### High Priority Risks
1. **Database Integration Complexity** (Issue #2)
   - **Mitigation**: Dedicated testing environment
   - **Owner**: Senior Backend Developer
   - **Review**: Daily during implementation

2. **File Sync Performance** (Issue #7)
   - **Mitigation**: Performance testing early
   - **Owner**: Senior Developer
   - **Review**: Weekly performance benchmarks

3. **Cross-Issue Dependencies**
   - **Mitigation**: Clear interface definitions
   - **Owner**: Tech Lead
   - **Review**: Dependency review in standups

### Medium Priority Risks
1. **Testing Infrastructure Setup**
   - **Mitigation**: Parallel development with Issue #1
   - **Owner**: DevOps/Testing Lead
   - **Review**: Weekly testing capability assessment

2. **Documentation Completeness**
   - **Mitigation**: Documentation-driven development
   - **Owner**: All developers
   - **Review**: Documentation review in each PR

## Next Steps

1. **Create GitHub Repository Setup**:
   - Create milestones (4 total)
   - Create labels (14 total)
   - Set up project board with columns

2. **Create Issues**:
   - Copy each issue template above
   - Assign to appropriate milestone
   - Add proper labels
   - Link related issues

3. **Team Assignment**:
   - Assign based on expertise and availability
   - Ensure proper load balancing
   - Set up notification preferences

4. **Begin Implementation**:
   - Start with Issue #1 (Express App Integration)
   - Set up development environment
   - Establish code review process

5. **Monitor Progress**:
   - Daily standup meetings
   - Weekly milestone reviews
   - Continuous risk assessment

## Related Documentation Links

- [TASK-007.2.1 Main Specification](./TASK_007_2_1_REST_API_ENDPOINTS.md)
- [GitHub Issues Breakdown](./TASK_007_2_1_GITHUB_ISSUES_BREAKDOWN.md)
- [Database Schema Documentation](./TASK_007_1_1_DATABASE_SCHEMA_BREAKDOWN.md)
- [Docker Infrastructure Setup](./TASK_007_0_DOCKER_INFRASTRUCTURE.md)
- [GitHub Project Management Guide](../github-project-management.md)
- [Development Setup Guide](../development-setup-guide.md)
- src/routes/users.ts - User management routes
- src/controllers/users.ts - User business logic
- src/services/user-preferences.ts - Preferences management
- src/services/device-management.ts - Device registration/management
```

## Definition of Done

- [ ] All 9 user endpoints implemented
- [ ] Proper authentication required
- [ ] Input validation working
- [ ] Rate limiting applied
- [ ] Error handling comprehensive
- [ ] Unit tests written
- [ ] Integration tests passing
- [ ] API documentation updated

````

---

## Issue #4: Conversation Management API Implementation

**Title**: `[TASK-007.2.1.4] Conversation Management API Endpoints`

**Labels**: `priority:high`, `type:crud`, `epic:rest-api`, `milestone:core-api`

**Milestone**: Core API Layer

**Assignees**: Backend Team

**Body**:
```markdown
## Overview
Implement conversation CRUD operations and participant management for the chat system.

## Priority
🟠 **High** | **Estimated Time**: 6-8 hours | **Assignee**: Backend Team

## Acceptance Criteria
- [ ] `GET /api/conversations` - List user conversations
- [ ] `POST /api/conversations` - Create new conversation
- [ ] `GET /api/conversations/:id` - Get conversation details
- [ ] `PUT /api/conversations/:id` - Update conversation
- [ ] `DELETE /api/conversations/:id` - Delete conversation
- [ ] `GET /api/conversations/:id/participants` - Get participants
- [ ] `POST /api/conversations/:id/participants` - Add participant
- [ ] `DELETE /api/conversations/:id/participants/:userId` - Remove participant
- [ ] Pagination for conversation lists
- [ ] Search and filtering capabilities
- [ ] Proper authorization (users can only access their conversations)

## Dependencies
- 🔄 Requires: Issue #1 (Express App Setup)
- 🔄 Requires: Issue #2 (Auth Database Integration)
- ✅ Requires: Conversation schema (TASK-007.1.1.2) - Complete

## Related Issues
- Links to: TASK-007.1.1.2 (Conversation Message Schema)
- Links to: Issue #5 (Message Operations)

## API Endpoints
````

GET /api/conversations
POST /api/conversations
GET /api/conversations/:id
PUT /api/conversations/:id
DELETE /api/conversations/:id
GET /api/conversations/:id/participants
POST /api/conversations/:id/participants
DELETE /api/conversations/:id/participants/:userId

````

## Technical Tasks
```typescript
// Files to create:
- src/routes/conversations.ts - Conversation routes
- src/controllers/conversations.ts - Conversation business logic
- src/services/conversation-participants.ts - Participant management
````

## Definition of Done

- [ ] All 8 conversation endpoints implemented
- [ ] Proper authorization implemented
- [ ] Pagination working
- [ ] Search functionality operational
- [ ] Participant management functional
- [ ] Unit tests written
- [ ] Integration tests passing
- [ ] API documentation updated

````

---

## Issue #5: Message Operations API Implementation

**Title**: `[TASK-007.2.1.5] Message Operations API Endpoints`

**Labels**: `priority:medium`, `type:advanced`, `epic:rest-api`, `milestone:advanced`

**Milestone**: Advanced Features

**Assignees**: Backend Team

**Body**:
```markdown
## Overview
Implement message CRUD operations, search functionality, and threading capabilities.

## Priority
🟡 **Medium** | **Estimated Time**: 6-8 hours | **Assignee**: Backend Team

## Acceptance Criteria
- [ ] `GET /api/conversations/:id/messages` - Get conversation messages
- [ ] `POST /api/conversations/:id/messages` - Send new message
- [ ] `GET /api/messages/:id` - Get specific message
- [ ] `PUT /api/messages/:id` - Update message
- [ ] `DELETE /api/messages/:id` - Delete message
- [ ] `GET /api/messages/search` - Search messages across conversations
- [ ] `GET /api/messages/:id/thread` - Get message thread/replies
- [ ] Pagination for message lists
- [ ] Real-time message notifications integration
- [ ] Message status tracking (sent, delivered, read)

## Dependencies
- 🔄 Requires: Issue #1 (Express App Setup)
- 🔄 Requires: Issue #4 (Conversation Management)
- ✅ Requires: Message schema (TASK-007.1.1.2) - Complete

## Related Issues
- Links to: TASK-007.1.1.2 (Conversation Message Schema)
- Links to: Real-time messaging services ✅ Complete
- Links to: Issue #4 (Conversation Management)

## API Endpoints
````

GET /api/conversations/:id/messages
POST /api/conversations/:id/messages
GET /api/messages/:id
PUT /api/messages/:id
DELETE /api/messages/:id
GET /api/messages/search
GET /api/messages/:id/thread

````

## Technical Tasks
```typescript
// Files to create:
- src/routes/messages.ts - Message routes
- src/controllers/messages.ts - Message business logic
- src/services/message-search.ts - Search functionality
- src/services/message-threading.ts - Threading logic
````

## Definition of Done

- [ ] All 7 message endpoints implemented
- [ ] Search functionality working
- [ ] Threading capabilities operational
- [ ] Real-time integration functional
- [ ] Message status tracking working
- [ ] Pagination implemented
- [ ] Unit tests written
- [ ] Integration tests passing

````

---

## Issue #6: Workspace Management API Implementation

**Title**: `[TASK-007.2.1.6] Workspace Management API Endpoints`

**Labels**: `priority:medium`, `type:crud`, `epic:rest-api`, `milestone:advanced`

**Milestone**: Advanced Features

**Assignees**: Backend Team

**Body**:
```markdown
## Overview
Implement workspace CRUD operations and management functionality for project organization.

## Priority
🟡 **Medium** | **Estimated Time**: 6-8 hours | **Assignee**: Backend Team

## Acceptance Criteria
- [ ] `GET /api/workspaces` - List user workspaces
- [ ] `POST /api/workspaces` - Create new workspace
- [ ] `GET /api/workspaces/:id` - Get workspace details
- [ ] `PUT /api/workspaces/:id` - Update workspace
- [ ] `DELETE /api/workspaces/:id` - Delete workspace
- [ ] `GET /api/workspaces/:id/members` - Get workspace members
- [ ] `POST /api/workspaces/:id/members` - Add workspace member
- [ ] `DELETE /api/workspaces/:id/members/:userId` - Remove member
- [ ] Workspace permissions and access control
- [ ] Workspace settings management

## Dependencies
- 🔄 Requires: Issue #1 (Express App Setup)
- 🔄 Requires: Issue #2 (Auth Database Integration)
- ✅ Requires: File sync schema (TASK-007.1.1.3) - Complete

## Related Issues
- Links to: TASK-007.1.1.3 (File Sync Workspace Schema)
- Links to: Issue #7 (File Sync Operations)

## API Endpoints
````

GET /api/workspaces
POST /api/workspaces
GET /api/workspaces/:id
PUT /api/workspaces/:id
DELETE /api/workspaces/:id
GET /api/workspaces/:id/members
POST /api/workspaces/:id/members
DELETE /api/workspaces/:id/members/:userId

````

## Technical Tasks
```typescript
// Files to create:
````
