import React, { createContext, useContext, useReducer, useEffect, useCallback } from "react"

// Types for our web-compatible extension state
export interface ChatMessage {
	id: string
	type: "user" | "assistant" | "system" | "tool"
	content: string
	timestamp: number
	status?: "sending" | "sent" | "error"
	toolName?: string
	isError?: boolean
}

export interface Task {
	id: string
	name: string
	messages: ChatMessage[]
	createdAt: number
	updatedAt: number
	status: "active" | "completed" | "error"
}

export interface ApiConfiguration {
	provider: string
	model: string
	apiKey?: string
	baseUrl?: string
	temperature?: number
}

export interface ExtensionState {
	// Current task
	currentTask: Task | null

	// Chat state
	messages: ChatMessage[]
	isLoading: boolean

	// Connection state
	isConnected: boolean
	connectionError: string | null

	// API configuration
	apiConfig: ApiConfiguration | null

	// UI state
	theme: "dark" | "light"
	isSettingsOpen: boolean

	// User preferences
	autoApprove: boolean
	soundEnabled: boolean

	// History
	taskHistory: Task[]
}

// Action types for state management
export type ExtensionAction =
	| { type: "SET_CONNECTION_STATUS"; payload: { isConnected: boolean; error?: string } }
	| { type: "ADD_MESSAGE"; payload: ChatMessage }
	| { type: "UPDATE_MESSAGE"; payload: { id: string; updates: Partial<ChatMessage> } }
	| { type: "SET_LOADING"; payload: boolean }
	| { type: "SET_API_CONFIG"; payload: ApiConfiguration }
	| { type: "SET_THEME"; payload: "dark" | "light" }
	| { type: "TOGGLE_SETTINGS"; payload?: boolean }
	| { type: "SET_AUTO_APPROVE"; payload: boolean }
	| { type: "SET_SOUND_ENABLED"; payload: boolean }
	| { type: "CREATE_NEW_TASK"; payload: { name: string } }
	| { type: "UPDATE_CURRENT_TASK"; payload: Partial<Task> }
	| { type: "LOAD_TASK_HISTORY"; payload: Task[] }
	| { type: "CLEAR_MESSAGES" }
	| { type: "RESET_STATE" }

// Initial state
const initialState: ExtensionState = {
	currentTask: null,
	messages: [],
	isLoading: false,
	isConnected: false,
	connectionError: null,
	apiConfig: null,
	theme: "dark",
	isSettingsOpen: false,
	autoApprove: false,
	soundEnabled: true,
	taskHistory: [],
}

// State reducer
function extensionReducer(state: ExtensionState, action: ExtensionAction): ExtensionState {
	switch (action.type) {
		case "SET_CONNECTION_STATUS":
			return {
				...state,
				isConnected: action.payload.isConnected,
				connectionError: action.payload.error || null,
			}

		case "ADD_MESSAGE":
			const newMessage = action.payload
			return {
				...state,
				messages: [...state.messages, newMessage],
				currentTask: state.currentTask
					? {
							...state.currentTask,
							messages: [...state.currentTask.messages, newMessage],
							updatedAt: Date.now(),
						}
					: null,
			}

		case "UPDATE_MESSAGE":
			const updatedMessages = state.messages.map((msg) =>
				msg.id === action.payload.id ? { ...msg, ...action.payload.updates } : msg,
			)
			return {
				...state,
				messages: updatedMessages,
				currentTask: state.currentTask
					? {
							...state.currentTask,
							messages: updatedMessages,
							updatedAt: Date.now(),
						}
					: null,
			}

		case "SET_LOADING":
			return {
				...state,
				isLoading: action.payload,
			}

		case "SET_API_CONFIG":
			return {
				...state,
				apiConfig: action.payload,
			}

		case "SET_THEME":
			return {
				...state,
				theme: action.payload,
			}

		case "TOGGLE_SETTINGS":
			return {
				...state,
				isSettingsOpen: action.payload !== undefined ? action.payload : !state.isSettingsOpen,
			}

		case "SET_AUTO_APPROVE":
			return {
				...state,
				autoApprove: action.payload,
			}

		case "SET_SOUND_ENABLED":
			return {
				...state,
				soundEnabled: action.payload,
			}

		case "CREATE_NEW_TASK":
			const newTask: Task = {
				id: Date.now().toString(),
				name: action.payload.name,
				messages: [],
				createdAt: Date.now(),
				updatedAt: Date.now(),
				status: "active",
			}
			return {
				...state,
				currentTask: newTask,
				messages: [],
				taskHistory: [newTask, ...state.taskHistory],
			}

		case "UPDATE_CURRENT_TASK":
			if (!state.currentTask) return state

			const updatedTask = { ...state.currentTask, ...action.payload, updatedAt: Date.now() }
			return {
				...state,
				currentTask: updatedTask,
				taskHistory: state.taskHistory.map((task) => (task.id === updatedTask.id ? updatedTask : task)),
			}

		case "LOAD_TASK_HISTORY":
			return {
				...state,
				taskHistory: action.payload,
			}

		case "CLEAR_MESSAGES":
			return {
				...state,
				messages: [],
			}

		case "RESET_STATE":
			return initialState

		default:
			return state
	}
}

// Context
export const ExtensionStateContext = createContext<{
	state: ExtensionState
	dispatch: React.Dispatch<ExtensionAction>
	// Helper functions
	addMessage: (message: Omit<ChatMessage, "id" | "timestamp">) => string
	updateMessage: (id: string, updates: Partial<ChatMessage>) => void
	sendMessage: (content: string) => Promise<void>
	createNewTask: (name?: string) => void
	setConnectionStatus: (isConnected: boolean, error?: string) => void
} | null>(null)

// Hook to use the extension state
export function useExtensionState() {
	const context = useContext(ExtensionStateContext)
	if (!context) {
		throw new Error("useExtensionState must be used within an ExtensionStateProvider")
	}
	return context
}

// Provider component
interface ExtensionStateProviderProps {
	children: React.ReactNode
}

export function ExtensionStateProvider({ children }: ExtensionStateProviderProps) {
	const [state, dispatch] = useReducer(extensionReducer, initialState)

	// Load state from localStorage on mount
	useEffect(() => {
		try {
			const savedState = localStorage.getItem("roo-code-extension-state")
			if (savedState) {
				const parsed = JSON.parse(savedState)
				if (parsed.taskHistory) {
					dispatch({ type: "LOAD_TASK_HISTORY", payload: parsed.taskHistory })
				}
				if (parsed.apiConfig) {
					dispatch({ type: "SET_API_CONFIG", payload: parsed.apiConfig })
				}
				if (parsed.theme) {
					dispatch({ type: "SET_THEME", payload: parsed.theme })
				}
				if (typeof parsed.autoApprove === "boolean") {
					dispatch({ type: "SET_AUTO_APPROVE", payload: parsed.autoApprove })
				}
				if (typeof parsed.soundEnabled === "boolean") {
					dispatch({ type: "SET_SOUND_ENABLED", payload: parsed.soundEnabled })
				}
			}
		} catch (error) {
			console.warn("Failed to load saved state:", error)
		}
	}, [])

	// Save state to localStorage when it changes
	useEffect(() => {
		try {
			const stateToSave = {
				taskHistory: state.taskHistory,
				apiConfig: state.apiConfig,
				theme: state.theme,
				autoApprove: state.autoApprove,
				soundEnabled: state.soundEnabled,
			}
			localStorage.setItem("roo-code-extension-state", JSON.stringify(stateToSave))
		} catch (error) {
			console.warn("Failed to save state:", error)
		}
	}, [state.taskHistory, state.apiConfig, state.theme, state.autoApprove, state.soundEnabled])

	// Helper function to add a message
	const addMessage = useCallback((message: Omit<ChatMessage, "id" | "timestamp">) => {
		const id = Date.now().toString() + Math.random().toString(36).substr(2, 9)
		const fullMessage: ChatMessage = {
			...message,
			id,
			timestamp: Date.now(),
		}
		dispatch({ type: "ADD_MESSAGE", payload: fullMessage })
		return id
	}, [])

	// Helper function to update a message
	const updateMessage = useCallback((id: string, updates: Partial<ChatMessage>) => {
		dispatch({ type: "UPDATE_MESSAGE", payload: { id, updates } })
	}, [])

	// Helper function to send a message
	const sendMessage = useCallback(
		async (content: string) => {
			if (!content.trim()) return

			// Add user message
			const userMessageId = addMessage({
				type: "user",
				content: content.trim(),
				status: "sending",
			})

			dispatch({ type: "SET_LOADING", payload: true })

			try {
				// Use VSCode API adapter to send message to Production CCS
				const vscode = (window as any).vscode
				if (vscode && vscode.isConnected()) {
					vscode.postMessage({
						type: "chat",
						action: "sendMessage",
						content: content.trim(),
					})

					// Update user message status
					updateMessage(userMessageId, { status: "sent" })

					console.log("✅ Message sent to Production CCS:", content.trim())
				} else {
					throw new Error("Not connected to Production CCS")
				}
			} catch (error) {
				console.error("❌ Failed to send message:", error)
				updateMessage(userMessageId, { status: "error" })
				addMessage({
					type: "system",
					content: `Error: ${error instanceof Error ? error.message : "Failed to send message"}`,
					isError: true,
				})
				dispatch({ type: "SET_LOADING", payload: false })
			}
		},
		[addMessage, updateMessage],
	)

	// Helper function to create a new task
	const createNewTask = useCallback((name?: string) => {
		const taskName = name || `Task ${Date.now()}`
		dispatch({ type: "CREATE_NEW_TASK", payload: { name: taskName } })
	}, [])

	// Helper function to set connection status
	const setConnectionStatus = useCallback((isConnected: boolean, error?: string) => {
		dispatch({ type: "SET_CONNECTION_STATUS", payload: { isConnected, error } })
	}, [])

	// Create initial task if none exists
	useEffect(() => {
		if (!state.currentTask && state.taskHistory.length === 0) {
			createNewTask("Welcome Chat")
		}
	}, [state.currentTask, state.taskHistory.length, createNewTask])

	// Listen for messages from VSCode API adapter (responses from extension via CCS)
	useEffect(() => {
		const handleVSCodeMessage = (event: CustomEvent) => {
			const { type, payload } = event.detail
			console.log("📨 Received message from CCS:", type, payload)

			switch (type) {
				case "action":
					// AI responses, tool usage, etc.
					if (payload?.text) {
						addMessage({
							type: "assistant",
							content: payload.text,
						})
						dispatch({ type: "SET_LOADING", payload: false })
					}
					break

				case "messageUpdated":
					// Streaming response updates
					if (payload?.content) {
						addMessage({
							type: "assistant",
							content: payload.content,
						})
						dispatch({ type: "SET_LOADING", payload: false })
					}
					break

				case "connectionStatus":
					// Connection status updates
					setConnectionStatus(payload?.connected || false, payload?.error)
					break

				case "error":
					// Error messages
					addMessage({
						type: "system",
						content: payload?.message || "An error occurred",
						isError: true,
					})
					dispatch({ type: "SET_LOADING", payload: false })
					break

				default:
					console.log("Unhandled message type:", type, payload)
					break
			}
		}

		// Listen for custom vscode-message events
		window.addEventListener("vscode-message", handleVSCodeMessage as EventListener)

		return () => {
			window.removeEventListener("vscode-message", handleVSCodeMessage as EventListener)
		}
	}, [addMessage, setConnectionStatus])

	const contextValue = {
		state,
		dispatch,
		addMessage,
		updateMessage,
		sendMessage,
		createNewTask,
		setConnectionStatus,
	}

	return <ExtensionStateContext.Provider value={contextValue}>{children}</ExtensionStateContext.Provider>
}
