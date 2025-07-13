import React, { useEffect, useRef, useCallback } from "react"
import { VSCodeIcon } from "../../utils/assetLoader"
import { AudioNotifications } from "../../utils/audioManager"
import { useExtensionState } from "../../context/ExtensionStateContext"
import "./ChatView.css"

export interface ChatViewProps {
	isHidden?: boolean
	className?: string
}

export interface ChatViewRef {
	sendMessage: (message: string) => void
	scrollToBottom: () => void
}

const ChatView = React.forwardRef<ChatViewRef, ChatViewProps>(({ isHidden = false, className = "" }, ref) => {
	const { state, sendMessage: sendMessageToContext } = useExtensionState()
	const { messages, isLoading, isConnected, connectionError } = state

	const messagesEndRef = useRef<HTMLDivElement>(null)
	const inputRef = useRef<HTMLTextAreaElement>(null)
	const [inputValue, setInputValue] = React.useState("")

	// Scroll to bottom when new messages arrive
	const scrollToBottom = useCallback(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
	}, [])

	useEffect(() => {
		scrollToBottom()
	}, [messages, scrollToBottom])

	// Handle sending messages
	const sendMessage = useCallback(
		async (message: string) => {
			if (!message.trim() || isLoading) return

			setInputValue("")

			// Play send sound
			AudioNotifications.messageSent()

			try {
				await sendMessageToContext(message.trim())
			} catch (error) {
				console.error("Failed to send message:", error)
				AudioNotifications.error()
			}
		},
		[isLoading, sendMessageToContext],
	)

	// Handle input submission
	const handleSubmit = useCallback(
		(e: React.FormEvent) => {
			e.preventDefault()
			sendMessage(inputValue)
		},
		[inputValue, sendMessage],
	)

	// Handle input key press
	const handleKeyPress = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault()
				sendMessage(inputValue)
			}
		},
		[inputValue, sendMessage],
	)

	// Expose methods through ref
	React.useImperativeHandle(
		ref,
		() => ({
			sendMessage,
			scrollToBottom,
		}),
		[sendMessage, scrollToBottom],
	)

	if (isHidden) {
		return null
	}

	return (
		<div className={`vscode-chat-container vscode-scrollbar ${className}`}>
			{/* Connection Status */}
			{!isConnected && (
				<div className="connection-status error">
					<span>⚠️ Not connected to server</span>
					{connectionError && <span className="error-detail">({connectionError})</span>}
				</div>
			)}

			{/* Chat Messages */}
			<div className="vscode-chat-messages">
				{messages.length === 0 && (
					<div className="vscode-chat-message system">
						<div className="message-content">
							👋 Welcome to Roo-Code Web! I'm your AI coding assistant. How can I help you today?
						</div>
					</div>
				)}

				{messages.map((message) => (
					<div key={message.id} className={`vscode-chat-message ${message.type}`}>
						<div className="message-header">
							<span className="message-sender">
								{message.type === "user"
									? "👤 You"
									: message.type === "assistant"
										? "🤖 Roo-Code"
										: message.type === "tool"
											? `🔧 ${message.toolName || "Tool"}`
											: "📢 System"}
							</span>
							<span className="message-time">{new Date(message.timestamp).toLocaleTimeString()}</span>
							{message.status && (
								<span className={`message-status ${message.status}`}>
									{message.status === "sending" && "⏳"}
									{message.status === "sent" && "✅"}
									{message.status === "error" && "❌"}
								</span>
							)}
						</div>
						<div className={`message-content ${message.isError ? "error" : ""}`}>{message.content}</div>
					</div>
				))}

				{/* Loading indicator */}
				{isLoading && (
					<div className="vscode-chat-message assistant">
						<div className="message-header">
							<span className="message-sender">🤖 Roo-Code</span>
							<span className="message-time">...</span>
						</div>
						<div className="message-content">
							<div className="typing-indicator">
								<span></span>
								<span></span>
								<span></span>
							</div>
						</div>
					</div>
				)}

				<div ref={messagesEndRef} />
			</div>

			{/* Chat Input */}
			<div className="vscode-chat-input-container">
				<form onSubmit={handleSubmit} className="chat-input-form">
					<div className="input-wrapper">
						<textarea
							ref={inputRef}
							value={inputValue}
							onChange={(e) => setInputValue(e.target.value)}
							onKeyPress={handleKeyPress}
							placeholder="Type your message here... (Press Enter to send, Shift+Enter for new line)"
							className="vscode-chat-input vscode-input"
							rows={1}
							disabled={isLoading}
						/>
						<button
							type="submit"
							disabled={!inputValue.trim() || isLoading}
							className="vscode-button send-button"
							title="Send message">
							<VSCodeIcon name="send" size={16} />
						</button>
					</div>
				</form>
			</div>
		</div>
	)
})

ChatView.displayName = "ChatView"

export default ChatView
