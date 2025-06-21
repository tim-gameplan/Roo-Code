# API Specifications
## Feature 2: Remote UI Access for Roo

### Document Information
- **Version**: 1.0
- **Date**: December 2024
- **Status**: Draft

---

## 1. Overview

This document defines the API specifications for communication between:
1. **UI Clients ↔ Central Communication Server (CCS)** - WebSocket API
2. **CCS ↔ Roo VS Code Extension** - IPC API

---

## 2. UI Client ↔ CCS WebSocket API

### 2.1 Connection Establishment

#### Authentication Flow
1. **HTTP Authentication Endpoint**
   ```
   POST /api/auth/login
   Content-Type: application/json
   
   {
     "username": "string",
     "password": "string"
   }
   
   Response:
   {
     "token": "jwt-token-string",
     "expiresAt": "2024-12-31T23:59:59Z",
     "user": {
       "id": "string",
       "username": "string"
     }
   }
   ```

2. **WebSocket Connection**
   ```
   WSS: wss://ccs-server.com/ws
   Headers:
     Authorization: Bearer <jwt-token>
   ```

### 2.2 Message Format

All WebSocket messages follow this structure:
```typescript
interface WebSocketMessage {
  type: string;
  payload: any;
  timestamp: string; // ISO-8601
  sessionId: string;
  messageId?: string; // For request/response correlation
}
```

### 2.3 Client-to-Server Messages

#### SUBMIT_PROMPT
Submit a new prompt to Roo for processing.
```typescript
{
  type: "SUBMIT_PROMPT",
  payload: {
    text: string;
    images?: string[]; // Base64 encoded images
    mode: "plan" | "act";
    attachments?: {
      name: string;
      content: string;
      type: string;
    }[];
  },
  timestamp: "2024-12-31T10:00:00Z",
  sessionId: "session-123",
  messageId: "msg-456"
}
```

#### CANCEL_TASK
Cancel the currently running task.
```typescript
{
  type: "CANCEL_TASK",
  payload: {
    taskId?: string; // Optional specific task ID
  },
  timestamp: "2024-12-31T10:00:00Z",
  sessionId: "session-123"
}
```

#### REQUEST_STATE
Request current Roo state information.
```typescript
{
  type: "REQUEST_STATE",
  payload: {
    includeHistory?: boolean;
    includeSettings?: boolean;
  },
  timestamp: "2024-12-31T10:00:00Z",
  sessionId: "session-123",
  messageId: "msg-789"
}
```

#### UPDATE_SETTINGS
Update Roo configuration settings.
```typescript
{
  type: "UPDATE_SETTINGS",
  payload: {
    settings: {
      autoApprove?: boolean;
      model?: string;
      maxTokens?: number;
      // Other Roo settings
    };
  },
  timestamp: "2024-12-31T10:00:00Z",
  sessionId: "session-123"
}
```

#### HEARTBEAT
Keep connection alive.
```typescript
{
  type: "HEARTBEAT",
  payload: {},
  timestamp: "2024-12-31T10:00:00Z",
  sessionId: "session-123"
}
```

### 2.4 Server-to-Client Messages

#### TASK_OUTPUT_CHUNK
Streaming response data from Roo.
```typescript
{
  type: "TASK_OUTPUT_CHUNK",
  payload: {
    content: string;
    isComplete: boolean;
    chunkIndex: number;
    taskId: string;
    tokenUsage?: {
      input: number;
      output: number;
      total: number;
    };
  },
  timestamp: "2024-12-31T10:00:00Z",
  sessionId: "session-123"
}
```

#### TASK_STATUS_UPDATE
Task progress and status changes.
```typescript
{
  type: "TASK_STATUS_UPDATE",
  payload: {
    taskId: string;
    status: "starting" | "running" | "completed" | "cancelled" | "error";
    progress?: {
      current: number;
      total: number;
      description: string;
    };
    error?: {
      code: string;
      message: string;
    };
  },
  timestamp: "2024-12-31T10:00:00Z",
  sessionId: "session-123"
}
```

#### STATE_UPDATE
Incremental state changes.
```typescript
{
  type: "STATE_UPDATE",
  payload: {
    updates: {
      conversationHistory?: Message[];
      currentTask?: TaskState;
      settings?: Partial<RooSettings>;
      tokenUsage?: TokenUsage;
    };
  },
  timestamp: "2024-12-31T10:00:00Z",
  sessionId: "session-123"
}
```

#### FULL_STATE
Complete state information (response to REQUEST_STATE).
```typescript
{
  type: "FULL_STATE",
  payload: {
    conversationHistory: Message[];
    currentTask?: TaskState;
    settings: RooSettings;
    tokenUsage: TokenUsage;
    capabilities: string[];
  },
  timestamp: "2024-12-31T10:00:00Z",
  sessionId: "session-123",
  messageId: "msg-789" // Correlates with REQUEST_STATE
}
```

#### ERROR_MESSAGE
Error notifications.
```typescript
{
  type: "ERROR_MESSAGE",
  payload: {
    code: string;
    message: string;
    details?: any;
    recoverable: boolean;
  },
  timestamp: "2024-12-31T10:00:00Z",
  sessionId: "session-123"
}
```

#### CONNECTION_ACK
Connection acknowledgment after successful authentication.
```typescript
{
  type: "CONNECTION_ACK",
  payload: {
    sessionId: string;
    serverVersion: string;
    capabilities: string[];
  },
  timestamp: "2024-12-31T10:00:00Z",
  sessionId: "session-123"
}
```

### 2.5 Error Codes

| Code | Description | Recoverable |
|------|-------------|-------------|
| AUTH_FAILED | Authentication failed | No |
| INVALID_MESSAGE | Message format invalid | Yes |
| RATE_LIMITED | Too many requests | Yes |
| SESSION_EXPIRED | Session token expired | No |
| TASK_FAILED | Task execution failed | Yes |
| CONNECTION_LOST | Lost connection to Roo | Yes |
| VALIDATION_ERROR | Input validation failed | Yes |

---

## 3. CCS ↔ Roo Extension IPC API

### 3.1 IPC Message Format

Uses the existing `IpcMessage` structure from `@roo-code/types`:
```typescript
interface IpcMessage {
  type: string;
  data?: any;
  requestId?: string;
}
```

### 3.2 CCS-to-Extension Messages

#### RemoteUITaskRequest
Request task execution from a remote UI client.
```typescript
{
  type: "RemoteUITaskRequest",
  data: {
    sessionId: string;
    clientId: string;
    prompt: {
      text: string;
      images?: string[];
      mode: "plan" | "act";
      attachments?: Attachment[];
    };
    settings?: Partial<RooSettings>;
  },
  requestId: "req-123"
}
```

#### RemoteUIStateRequest
Request current state information.
```typescript
{
  type: "RemoteUIStateRequest",
  data: {
    sessionId: string;
    clientId: string;
    includeHistory: boolean;
    includeSettings: boolean;
  },
  requestId: "req-456"
}
```

#### RemoteUISettingsUpdate
Update Roo settings from remote client.
```typescript
{
  type: "RemoteUISettingsUpdate",
  data: {
    sessionId: string;
    clientId: string;
    settings: Partial<RooSettings>;
  },
  requestId: "req-789"
}
```

#### RemoteUITaskCancel
Cancel running task from remote client.
```typescript
{
  type: "RemoteUITaskCancel",
  data: {
    sessionId: string;
    clientId: string;
    taskId?: string;
  },
  requestId: "req-101"
}
```

#### RemoteUISessionInit
Initialize new remote session.
```typescript
{
  type: "RemoteUISessionInit",
  data: {
    sessionId: string;
    clientId: string;
    userInfo: {
      id: string;
      username: string;
    };
  },
  requestId: "req-202"
}
```

#### RemoteUISessionEnd
End remote session.
```typescript
{
  type: "RemoteUISessionEnd",
  data: {
    sessionId: string;
    clientId: string;
  },
  requestId: "req-303"
}
```

### 3.3 Extension-to-CCS Messages

#### RemoteUITaskResponse
Response to task execution request.
```typescript
{
  type: "RemoteUITaskResponse",
  data: {
    sessionId: string;
    clientId: string;
    taskId: string;
    status: "started" | "completed" | "error";
    error?: {
      code: string;
      message: string;
    };
  },
  requestId: "req-123" // Correlates with request
}
```

#### RemoteUITaskProgress
Task progress updates.
```typescript
{
  type: "RemoteUITaskProgress",
  data: {
    sessionId: string;
    clientId: string;
    taskId: string;
    content?: string;
    isComplete: boolean;
    tokenUsage?: TokenUsage;
    progress?: {
      current: number;
      total: number;
      description: string;
    };
  }
}
```

#### RemoteUIStateUpdate
State change notifications.
```typescript
{
  type: "RemoteUIStateUpdate",
  data: {
    sessionId: string;
    clientId: string;
    updates: {
      conversationHistory?: Message[];
      currentTask?: TaskState;
      settings?: Partial<RooSettings>;
      tokenUsage?: TokenUsage;
    };
  }
}
```

#### RemoteUIStateResponse
Response to state request.
```typescript
{
  type: "RemoteUIStateResponse",
  data: {
    sessionId: string;
    clientId: string;
    state: {
      conversationHistory: Message[];
      currentTask?: TaskState;
      settings: RooSettings;
      tokenUsage: TokenUsage;
      capabilities: string[];
    };
  },
  requestId: "req-456" // Correlates with request
}
```

#### RemoteUIError
Error notifications.
```typescript
{
  type: "RemoteUIError",
  data: {
    sessionId: string;
    clientId: string;
    error: {
      code: string;
      message: string;
      details?: any;
    };
  },
  requestId?: string // If correlates with request
}
```

---

## 4. Data Type Definitions

### 4.1 Common Types

```typescript
interface Message {
  id: string;
  type: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  tokenUsage?: TokenUsage;
}

interface TaskState {
  id: string;
  status: "running" | "completed" | "cancelled" | "error";
  prompt: string;
  startTime: string;
  endTime?: string;
  progress?: {
    current: number;
    total: number;
    description: string;
  };
}

interface TokenUsage {
  input: number;
  output: number;
  total: number;
  cost?: number;
}

interface RooSettings {
  autoApprove: boolean;
  model: string;
  maxTokens: number;
  temperature: number;
  // Additional settings as needed
}

interface Attachment {
  name: string;
  content: string;
  type: string;
  size: number;
}
```

---

## 5. Authentication & Security

### 5.1 JWT Token Structure
```typescript
interface JWTPayload {
  sub: string; // User ID
  username: string;
  iat: number; // Issued at
  exp: number; // Expires at
  sessionId?: string;
}
```

### 5.2 Rate Limiting
- **WebSocket messages**: 100 messages per minute per session
- **Authentication attempts**: 5 attempts per minute per IP
- **State requests**: 10 requests per minute per session

### 5.3 Input Validation
- All string inputs must be sanitized
- File uploads limited to 10MB
- Message payload size limited to 1MB
- Prompt length limited to 100,000 characters

---

## 6. Error Handling

### 6.1 WebSocket Error Responses
```typescript
{
  type: "ERROR_MESSAGE",
  payload: {
    code: "ERROR_CODE",
    message: "Human readable message",
    details: { /* Additional context */ },
    recoverable: boolean
  },
  timestamp: "2024-12-31T10:00:00Z",
  sessionId: "session-123"
}
```

### 6.2 IPC Error Responses
```typescript
{
  type: "RemoteUIError",
  data: {
    sessionId: "session-123",
    clientId: "client-456",
    error: {
      code: "ERROR_CODE",
      message: "Human readable message",
      details: { /* Additional context */ }
    }
  },
  requestId: "req-123"
}
```

---

## 7. Message Flow Examples

### 7.1 Typical Task Submission Flow
```
1. Client → CCS: SUBMIT_PROMPT
2. CCS → Extension: RemoteUITaskRequest
3. Extension → CCS: RemoteUITaskResponse (started)
4. CCS → Client: TASK_STATUS_UPDATE (starting)
5. Extension → CCS: RemoteUITaskProgress (streaming)
6. CCS → Client: TASK_OUTPUT_CHUNK (streaming)
7. Extension → CCS: RemoteUITaskProgress (complete)
8. CCS → Client: TASK_STATUS_UPDATE (completed)
```

### 7.2 State Synchronization Flow
```
1. Client → CCS: REQUEST_STATE
2. CCS → Extension: RemoteUIStateRequest
3. Extension → CCS: RemoteUIStateResponse
4. CCS → Client: FULL_STATE
```

### 7.3 Real-time Update Flow
```
1. Extension: State changes internally
2. Extension → CCS: RemoteUIStateUpdate
3. CCS → All Clients: STATE_UPDATE
```

---

## 8. Version Compatibility

### 8.1 API Versioning
- API version included in connection handshake
- Backward compatibility maintained for 2 major versions
- Deprecation notices sent 6 months before removal

### 8.2 Message Format Evolution
- New optional fields can be added without breaking changes
- Required field additions require version bump
- Field removal requires deprecation period
