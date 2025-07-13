# Roo-Code System Architecture Reference

**Version**: 1.0  
**Last Updated**: July 13, 2025  
**Status**: Master Reference Document

---

## 📋 Document Purpose

This document serves as the **master reference** for Roo-Code's complete system architecture, preventing duplicate work and ensuring all engineers have full understanding of:

- ✅ What components exist and their status
- ✅ How components interact and communicate
- ✅ What capabilities are already built vs. what needs development
- ✅ Integration points and dependencies
- ✅ Technical decisions and architectural patterns

---

## 🏗️ System Architecture Overview

Roo-Code is a sophisticated AI coding assistant implemented as a **VSCode extension with extensive remote access capabilities**. The system follows a **multi-layered architecture** with three primary access methods:

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT LAYER                            │
├─────────────────────┬───────────────────┬───────────────────┤
│   Mobile Browser    │    Web Browser    │   VSCode Webview │
│   (POC - Port 8081) │   (Port 5173)     │   (Embedded)      │
└─────────────────────┴───────────────────┴───────────────────┘
           │                      │                      │
           │ IPC                  │ WebSocket           │ PostMessage
           │                      │                      │
┌─────────────────────────────────────────────────────────────┐
│                  COMMUNICATION LAYER                        │
├─────────────────────┬───────────────────┬───────────────────┤
│   POC Server        │  Production CCS   │   Extension API   │
│   (Express/IPC)     │  (Node.js/WS)     │   (EventEmitter)  │
└─────────────────────┴───────────────────┴───────────────────┘
           │                      │                      │
           └──────────────────────┼──────────────────────┘
                                  │ IPC/Direct
                                  │
┌─────────────────────────────────────────────────────────────┐
│                   EXTENSION CORE                            │
├─────────────────────┬───────────────────┬───────────────────┤
│   ClineProvider     │    Task Manager   │   Tool System     │
│   (AI Controller)   │    (Lifecycle)    │   (26+ Tools)     │
└─────────────────────┴───────────────────┴───────────────────┘
           │                      │                      │
           └──────────────────────┼──────────────────────┘
                                  │
┌─────────────────────────────────────────────────────────────┐
│                   SERVICE LAYER                             │
├─────────────────────┬───────────────────┬───────────────────┤
│   AI Providers      │    MCP Servers    │   Cloud Services  │
│   (24 providers)    │   (External tools)│   (Auth/Sync)     │
└─────────────────────┴───────────────────┴───────────────────┘
```

---

## 📦 Component Inventory and Status

### 🎯 VSCode Extension Core

**Location**: `/src/`  
**Status**: ✅ **PRODUCTION READY**  
**Language**: TypeScript

#### Core Components:

| Component            | File                            | Status      | Capabilities                                    |
| -------------------- | ------------------------------- | ----------- | ----------------------------------------------- |
| **Main Entry Point** | `extension.ts`                  | ✅ Complete | Extension activation, cloud service integration |
| **AI Controller**    | `core/webview/ClineProvider.ts` | ✅ Complete | Central AI interaction management               |
| **Task Management**  | `core/task/Task.ts`             | ✅ Complete | Individual conversation/task lifecycle          |
| **Webview Provider** | `core/webview/`                 | ✅ Complete | VSCode webview integration                      |

#### Service Layer:

| Service             | Location                | Status      | Purpose                                 |
| ------------------- | ----------------------- | ----------- | --------------------------------------- |
| **MCP Integration** | `services/mcp/`         | ✅ Complete | External tool protocol support          |
| **Code Indexing**   | `services/code-index/`  | ✅ Complete | Semantic search, codebase understanding |
| **Checkpoints**     | `services/checkpoints/` | ✅ Complete | Git-based state management              |

#### Tool System:

**Location**: `src/core/tools/`  
**Status**: ✅ **EXTENSIVE AND OPERATIONAL**

**Available Tools** (26+ tools):

- ✅ File operations (read, write, search, diff)
- ✅ Terminal command execution
- ✅ Browser automation
- ✅ Code search and analysis
- ✅ Task management and mode switching
- ✅ MCP tool integration

**Architecture**: Extensible with consistent interfaces, validation, progress tracking

---

### 🤖 AI Provider Integrations

**Location**: `/src/api/providers/`  
**Status**: ✅ **COMPREHENSIVE - 24 PROVIDERS**

#### Supported Providers:

| Category                 | Providers                                     | Status      |
| ------------------------ | --------------------------------------------- | ----------- |
| **Major Cloud**          | Anthropic, OpenAI, Google Gemini, AWS Bedrock | ✅ Complete |
| **Alternative Services** | OpenRouter, Groq, Mistral, DeepSeek           | ✅ Complete |
| **Local/Self-hosted**    | Ollama, LM Studio, LiteLLM                    | ✅ Complete |
| **Enterprise**           | Vertex AI, Azure OpenAI                       | ✅ Complete |
| **Specialized**          | Claude Code, Human Relay, Fake AI (testing)   | ✅ Complete |

**Architecture**: Consistent `ApiHandler` interface, base provider classes, stream processing

---

### 🌐 Remote UI Implementations

#### 1. POC Remote UI

**Location**: `/poc-remote-ui/`  
**Port**: 8081  
**Status**: ✅ **WORKING PROOF OF CONCEPT**

**Capabilities**:

- ✅ Direct Unix socket communication (`/tmp/app.roo-extension`)
- ✅ Zero-dependency mobile browser access
- ✅ TaskCommand protocol for starting new tasks
- ✅ **PROVEN: Sends messages to LLM through Roo and receives responses**

**Limitations**:

- 🔶 Local network only
- 🔶 Basic security (no authentication)
- 🔶 Simple HTML interface

**Architecture**: `Mobile Browser → Express Server → IPC Socket → VSCode Extension → LLM`

#### 2. Production CCS

**Location**: `/production-ccs/`  
**Port**: 3000  
**Status**: ✅ **ENTERPRISE-READY FRAMEWORK**

**Features**:

- ✅ JWT authentication system
- ✅ WebSocket real-time communication
- ✅ PostgreSQL database integration
- ✅ Session management and device registry
- ✅ Rate limiting and security middleware
- ✅ **PROVEN: Bidirectional WebSocket communication working**

**Services**:

- ✅ Authentication and user management
- ✅ Real-time messaging service
- ✅ Database-WebSocket integration
- ✅ Event broadcasting system

#### 3. Web UI (Phase 1.4)

**Location**: `/web-ui/`  
**Port**: 5173  
**Status**: ✅ **REACT-BASED UI WITH CHATVIEW**

**Recent Implementation** (Phase 1.4):

- ✅ Professional ChatView component
- ✅ VSCode theme integration
- ✅ React Context state management
- ✅ WebSocket adapter layer
- ✅ Mobile responsive design
- ✅ Audio notifications

**Current Connection**: Mock WebSocket adapter (needs connection to Production CCS)

---

### 📚 Shared Libraries

**Location**: `/packages/`  
**Status**: ✅ **MATURE TYPESCRIPT PACKAGES**

| Package          | Purpose                                        | Status      |
| ---------------- | ---------------------------------------------- | ----------- |
| **`types/`**     | TypeScript definitions, message protocols      | ✅ Complete |
| **`cloud/`**     | Cloud service integration, auth, settings sync | ✅ Complete |
| **`ipc/`**       | Inter-process communication protocols          | ✅ Complete |
| **`telemetry/`** | Analytics, monitoring, PostHog integration     | ✅ Complete |

---

### 🔗 Communication Protocols

#### Extension-Webview Communication

**Files**: `ExtensionMessage.ts`, `WebviewMessage.ts`  
**Status**: ✅ **COMPLETE**  
**Protocol**: Event-driven messaging with TypeScript safety  
**Features**: State synchronization, command routing, real-time updates

#### IPC API

**Status**: ✅ **OPERATIONAL**  
**Protocol**: Unix socket-based  
**Features**: Task commands, event broadcasting, configuration management  
**Security**: Environment variable-based socket path

#### WebSocket API

**Status**: ✅ **PRODUCTION-READY**  
**Protocol**: JSON-based real-time  
**Features**: JWT authentication, message routing, session management  
**Security**: TLS encryption, input validation, rate limiting

---

## 🔄 Data Flow Patterns

### 1. Task Execution Flow (WORKING)

```
Client → Communication Layer → Extension Core → AI Provider → Tool Execution → Response Stream
```

### 2. State Synchronization (WORKING)

```
Extension Core → Communication Layer → Multiple Clients
```

### 3. Authentication Flow (WORKING)

```
Client → Production CCS → Database → JWT → Ongoing Session
```

### 4. Real-time Updates (WORKING)

```
Extension Events → Communication Layer → WebSocket Broadcast → Client Updates
```

---

## ✅ What's Already Working

### Bidirectional Communication PROVEN:

1. **POC Remote UI**: ✅ Mobile browser sends messages → LLM → receives responses
2. **Production CCS**: ✅ Advanced WebSocket server with real-time messaging
3. **Extension Core**: ✅ Full AI provider integration with 24 providers
4. **Tool System**: ✅ 26+ tools working with validation and progress tracking

### Key Integration Points OPERATIONAL:

- ✅ `src/extension/api.ts` - Main API class handling task management
- ✅ `src/core/webview/ClineProvider.ts` - Central controller for AI interactions
- ✅ IPC protocol for remote task starting via `startNewTask()` method
- ✅ WebSocket infrastructure in Production CCS

---

## 🎯 Current Development Status

### Phase 1: Foundation Infrastructure ✅ COMPLETE

- ✅ Phase 1.1: Component imports and integration
- ✅ Phase 1.2: VSCode API compatibility layer
- ✅ Phase 1.3: CSS and asset management system
- ✅ Phase 1.4: Basic ChatView with working message flow

### Next Phase: Integration (NOT Protocol Development)

**The infrastructure for bidirectional communication EXISTS and WORKS.**

**Phase 2.1 Should Be**: Connect Phase 1.4 ChatView to Production CCS

- 🔧 Update VSCodeAPIAdapter to use Production CCS WebSocket (port 3000)
- 🔧 Map ChatView messages to existing Extension message protocols
- 🔧 Implement streaming responses using existing infrastructure
- 🔧 Test bidirectional sync between extension and web ChatView

---

## 🚫 What NOT to Rebuild

### ❌ Do NOT Reinvent:

1. **WebSocket Protocols** - Production CCS has enterprise-ready WebSocket server
2. **Message Schemas** - ExtensionMessage.ts has 178+ message types defined
3. **AI Provider Integration** - 24 providers already working with consistent interface
4. **Tool System** - 26+ tools operational with extensible architecture
5. **Authentication** - JWT system in Production CCS ready to use
6. **IPC Communication** - POC Remote UI proves bidirectional communication works

### ✅ Do Build On:

1. **Phase 1.4 ChatView** - Polished UI that needs proper backend connection
2. **Production CCS Infrastructure** - Enterprise WebSocket server ready for integration
3. **Existing Message Protocols** - Rich schema already defined
4. **Tool Integration Points** - Established patterns for tool access

---

## 🔧 Integration Architecture

### Current State:

```
Phase 1.4 ChatView → Mock WebSocket Adapter → Simulated Responses
```

### Target State:

```
Phase 1.4 ChatView → Production CCS WebSocket → Extension API → AI Providers & Tools
```

### Integration Points:

1. **Replace Mock Adapter**: Connect VSCodeAPIAdapter to Production CCS (port 3000)
2. **Message Mapping**: Map ChatView messages to ExtensionMessage protocols
3. **Streaming Support**: Use existing WebSocket infrastructure for real-time responses
4. **State Synchronization**: Sync ChatView state with extension state

---

## 📊 Technical Specifications

### Technology Stack:

- **Frontend**: React 18, TypeScript, Vite, WebSocket, CSS
- **Backend**: Node.js, Express.js, PostgreSQL, JWT, WebSocket
- **Extension**: VSCode API, EventEmitter, IPC, TypeScript
- **Communication**: WebSocket, IPC, PostMessage

### Security:

- ✅ TLS/WSS encryption
- ✅ JWT authentication with refresh tokens
- ✅ bcrypt password hashing
- ✅ Rate limiting and input validation
- ✅ Security audit logging

### Performance:

- ✅ Connection pooling (PostgreSQL)
- ✅ Message queuing and batching
- ✅ Real-time streaming responses
- ✅ Efficient state synchronization

---

## 🎯 Development Guidelines

### Before Building New Components:

1. **Check this document** - Is it already built?
2. **Review existing implementations** - Can you extend instead of rebuild?
3. **Verify integration points** - What APIs already exist?
4. **Test existing capabilities** - What's already working?

### When Adding Features:

1. **Use existing patterns** - Follow established architectural patterns
2. **Extend existing systems** - Build on proven infrastructure
3. **Maintain type safety** - Use existing TypeScript definitions
4. **Follow security practices** - Use established authentication and validation

### Integration Priorities:

1. **Connect existing working pieces** before building new ones
2. **Validate bidirectional communication** using existing infrastructure
3. **Enhance UI/UX** with existing backend capabilities
4. **Add new features** only after confirming existing capabilities are insufficient

---

## 📈 Roadmap Priorities

### Immediate (Next Sprint):

1. **Connect ChatView to Production CCS** - Use existing enterprise WebSocket infrastructure
2. **Implement message mapping** - Use existing ExtensionMessage protocols
3. **Add streaming responses** - Use existing WebSocket streaming capabilities
4. **Test full bidirectional flow** - Validate web UI ↔ extension ↔ AI provider

### Short-term:

1. **Rich content support** - Code highlighting, file operations using existing tools
2. **Real-time state sync** - Use existing state management patterns
3. **Mobile optimization** - Enhance existing responsive design
4. **Tool integration** - Connect web UI to existing 26+ tools

### Long-term:

1. **Multi-session management** - Extend existing session infrastructure
2. **Advanced security** - Enhance existing JWT and audit systems
3. **Scalability** - Build on existing architecture patterns
4. **Enterprise features** - Extend existing user management

---

## 🔍 Key Architectural Decisions

### Why Three Remote UI Implementations?

1. **POC Remote UI**: Proof of concept for mobile access, minimal dependencies
2. **Production CCS**: Enterprise-ready with full feature set for production deployment
3. **Web UI**: Rich React interface for development and testing

### Why Not Build New Communication Protocols?

- ✅ **POC proves bidirectional communication works**
- ✅ **Production CCS provides enterprise-ready WebSocket infrastructure**
- ✅ **ExtensionMessage.ts defines comprehensive message schemas**
- ✅ **IPC and WebSocket protocols already handle real-time communication**

### Integration Strategy:

- **Build UI enhancements** on existing backend infrastructure
- **Use proven communication channels** instead of creating new ones
- **Extend existing message protocols** rather than defining new schemas
- **Leverage existing tool and AI provider integrations**

---

**📌 Remember**: The goal is "virtually indistinguishable" experience between VSCode extension and remote UI. The infrastructure to achieve this **already exists and works** - we need integration, not reinvention.

---

## 📞 For Questions or Updates

This document should be updated whenever:

- ✅ New components are added to the system
- ✅ Existing components change status or capabilities
- ✅ Integration points are modified
- ✅ Architectural decisions are made

**Maintainers**: Update this document to prevent duplicate work and ensure team alignment.

**Last Review**: July 13, 2025 - Comprehensive system analysis completed
