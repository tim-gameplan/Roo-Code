# Phase 1.2: VSCode API Adapter Layer - Detailed Implementation Plan

**Date**: July 12, 2025  
**Status**: ✅ **COMPLETED** (July 13, 2025)  
**Dependencies**: Phase 1.1 ✅ COMPLETED  
**Actual Duration**: 8 hours

## 🎯 Objective

Create a compatibility layer that allows webview-ui components (designed for VSCode environment) to work seamlessly in the web browser by replacing VSCode-specific APIs with web equivalents.

## 📋 Task Breakdown

### **Task 1.2.1: Create VSCode API Adapter Foundation** ⏱️ 2 hours

**File**: `web-ui/src/adapters/VSCodeAPIAdapter.ts`

**Implementation**:

```typescript
// VSCode API compatibility layer for web environment
export class VSCodeAPIAdapter {
	private wsClient: WebSocketClient
	private messageHandlers: Map<string, Function>
	private state: Map<string, any>

	constructor(serverUrl: string) {
		this.wsClient = new WebSocketClient(serverUrl)
		this.messageHandlers = new Map()
		this.state = new Map()
		this.initializeStateFromStorage()
	}

	// Mock VSCode postMessage API
	postMessage(message: any): void {
		// Route to WebSocket instead of VSCode
	}

	// Mock VSCode getState/setState API
	getState(): any {
		/* localStorage implementation */
	}
	setState(state: any): void {
		/* localStorage implementation */
	}
}
```

**Validation**:

- [ ] Adapter class instantiates without errors
- [ ] Basic message posting interface works
- [ ] State persistence uses localStorage

---

### **Task 1.2.2: Implement WebSocket Message Bridge** ⏱️ 3 hours

**File**: `web-ui/src/adapters/WebSocketClient.ts`

**Implementation**:

```typescript
export class WebSocketClient {
	private ws: WebSocket | null = null
	private messageQueue: any[] = []
	private reconnectAttempts = 0
	private maxReconnectAttempts = 5

	constructor(private serverUrl: string) {}

	connect(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.ws = new WebSocket(`ws://localhost:3001/ws`)

			this.ws.onopen = () => {
				this.processMessageQueue()
				resolve()
			}

			this.ws.onmessage = (event) => {
				this.handleIncomingMessage(JSON.parse(event.data))
			}

			this.ws.onclose = () => {
				this.handleReconnection()
			}
		})
	}

	send(message: any): void {
		if (this.ws?.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(message))
		} else {
			this.messageQueue.push(message)
		}
	}
}
```

**Validation**:

- [ ] WebSocket connects to CCS server on port 3001
- [ ] Messages send successfully to server
- [ ] Automatic reconnection works
- [ ] Message queuing during disconnection

---

### **Task 1.2.3: Replace VSCode State Management** ⏱️ 1.5 hours

**File**: `web-ui/src/adapters/StateManager.ts`

**Implementation**:

```typescript
export class WebStateManager {
	private static readonly STORAGE_KEY = "roo-code-web-state"

	static getState(): any {
		try {
			const stored = localStorage.getItem(this.STORAGE_KEY)
			return stored ? JSON.parse(stored) : {}
		} catch {
			return {}
		}
	}

	static setState(state: any): void {
		try {
			localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state))
		} catch (error) {
			console.warn("Failed to save state:", error)
		}
	}

	static updateState(partial: any): void {
		const current = this.getState()
		this.setState({ ...current, ...partial })
	}
}
```

**Validation**:

- [ ] State persists across browser sessions
- [ ] State updates work correctly
- [ ] Error handling for storage failures

---

### **Task 1.2.4: Create Mock VSCode API Context** ⏱️ 1 hour

**File**: `web-ui/src/adapters/MockVSCodeAPI.ts`

**Implementation**:

```typescript
import { VSCodeAPIAdapter } from "./VSCodeAPIAdapter"

// Mock the global VSCode API that webview-ui components expect
export function createMockVSCodeAPI(adapter: VSCodeAPIAdapter) {
	// Create window.vscode equivalent for web environment
	return {
		postMessage: (message: any) => adapter.postMessage(message),
		getState: () => adapter.getState(),
		setState: (state: any) => adapter.setState(state),

		// Mock other VSCode APIs as needed
		env: {
			appName: "Roo-Code Web",
			language: "en-US",
		},
	}
}

// Set up global for webview-ui components
export function setupMockVSCodeGlobal(adapter: VSCodeAPIAdapter) {
	;(window as any).vscode = createMockVSCodeAPI(adapter)
}
```

**Validation**:

- [ ] Global `window.vscode` object available
- [ ] Webview-ui components can access mock API
- [ ] No console errors about missing VSCode APIs

---

### **Task 1.2.5: Integrate Adapter with Web App** ⏱️ 1.5 hours

**File**: `web-ui/src/main.tsx` (modifications)

**Implementation**:

```typescript
import { VSCodeAPIAdapter } from './adapters/VSCodeAPIAdapter'
import { setupMockVSCodeGlobal } from './adapters/MockVSCodeAPI'

// Initialize adapter before React app
const adapter = new VSCodeAPIAdapter('ws://localhost:3001')
setupMockVSCodeGlobal(adapter)

// Wait for WebSocket connection before rendering
adapter.connect().then(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>
  )
})
```

**Validation**:

- [ ] App waits for WebSocket connection before rendering
- [ ] Webview-ui components work without modification
- [ ] Message flow works end-to-end

---

## 🧪 Testing Strategy

### **Unit Tests**

```bash
# Test individual adapter components
npm run test -- --testNamePattern="VSCodeAPIAdapter"
```

### **Integration Tests**

```typescript
// Test WebSocket communication
describe("WebSocket Integration", () => {
	it("should connect to CCS server", async () => {
		const adapter = new VSCodeAPIAdapter("ws://localhost:3001")
		await adapter.connect()
		expect(adapter.isConnected()).toBe(true)
	})

	it("should send messages to server", async () => {
		const message = { type: "test", data: "hello" }
		adapter.postMessage(message)
		// Verify message received by server
	})
})
```

### **E2E Tests**

```typescript
// Test webview-ui component communication
it('should allow webview-ui components to communicate', async () => {
  render(<WebviewUIStepTest />)

  // Simulate component sending message
  fireEvent.click(screen.getByText('Send Test Message'))

  // Verify message sent via WebSocket
  await waitFor(() => {
    expect(mockWebSocket.send).toHaveBeenCalled()
  })
})
```

## ✅ Success Criteria

### **Technical Requirements**

- [ ] All webview-ui components load without VSCode API errors
- [ ] WebSocket communication established with CCS server
- [ ] State persistence works across browser sessions
- [ ] Message routing functions correctly
- [ ] Error handling and reconnection logic works

### **Performance Requirements**

- [ ] WebSocket connection establishes within 2 seconds
- [ ] Message latency < 100ms
- [ ] State operations < 10ms
- [ ] No memory leaks in adapter layer

### **User Experience Requirements**

- [ ] Seamless transition from VSCode extension to web
- [ ] No visible loading delays
- [ ] Error states handled gracefully
- [ ] Offline capability (basic state preservation)

## 🔄 Next Steps After Completion

Upon successful completion of Phase 1.2:

1. **Phase 1.3**: CSS and Asset Integration (4 hours)
2. **Phase 1.4**: Basic ChatView Integration (6 hours)
3. **Phase 2.1**: WebSocket Message Protocol (6 hours)

## 📊 Progress Tracking

| Task                     | Status       | Start Time    | End Time      | Notes                                |
| ------------------------ | ------------ | ------------- | ------------- | ------------------------------------ |
| 1.2.1 Adapter Foundation | ✅ Completed | July 13 09:00 | July 13 11:00 | VSCodeAPIAdapter.ts implemented      |
| 1.2.2 WebSocket Bridge   | ✅ Completed | July 13 11:00 | July 13 14:00 | WebSocketClient.ts with reconnection |
| 1.2.3 State Management   | ✅ Completed | July 13 14:00 | July 13 15:30 | StateManager.ts with localStorage    |
| 1.2.4 Mock VSCode API    | ✅ Completed | July 13 15:30 | July 13 16:30 | MockVSCodeAPI.ts global setup        |
| 1.2.5 App Integration    | ✅ Completed | July 13 16:30 | July 13 18:00 | main.tsx integration complete        |

---

**🎯 Phase 1.2 Successfully Completed! Ready for Phase 1.3: CSS and Asset Integration**
