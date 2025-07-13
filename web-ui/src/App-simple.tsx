import { useState } from "react"

function App() {
	const [message, setMessage] = useState("")
	const [messages, setMessages] = useState<string[]>([])

	const handleSendMessage = () => {
		if (message.trim()) {
			setMessages((prev) => [...prev, message])
			setMessage("")
		}
	}

	return (
		<div
			style={{
				padding: "20px",
				fontFamily: "Arial, sans-serif",
				maxWidth: "800px",
				margin: "0 auto",
			}}>
			<h1 style={{ color: "#333", textAlign: "center" }}>🎯 Roo-Code Remote UI</h1>

			<div
				style={{
					backgroundColor: "#f5f5f5",
					padding: "20px",
					borderRadius: "8px",
					marginBottom: "20px",
				}}>
				<h2 style={{ color: "#666", marginTop: 0 }}>System Status</h2>
				<div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
					<div
						style={{
							backgroundColor: "#e8f5e8",
							padding: "10px",
							borderRadius: "4px",
							border: "1px solid #4caf50",
						}}>
						<strong>Web UI:</strong> ✅ Running on port 5173
					</div>
					<div
						style={{
							backgroundColor: "#fff3cd",
							padding: "10px",
							borderRadius: "4px",
							border: "1px solid #ffc107",
						}}>
						<strong>Backend CCS:</strong> ⚠️ Not connected (port 3001)
					</div>
					<div
						style={{
							backgroundColor: "#f8d7da",
							padding: "10px",
							borderRadius: "4px",
							border: "1px solid #dc3545",
						}}>
						<strong>POC Remote UI:</strong> ❌ Offline (port 8081)
					</div>
				</div>
			</div>

			<div
				style={{
					backgroundColor: "white",
					border: "1px solid #ddd",
					borderRadius: "8px",
					padding: "20px",
				}}>
				<h3 style={{ marginTop: 0 }}>Test Chat Interface</h3>

				<div
					style={{
						height: "200px",
						border: "1px solid #ccc",
						borderRadius: "4px",
						padding: "10px",
						marginBottom: "10px",
						overflowY: "auto",
						backgroundColor: "#fafafa",
					}}>
					{messages.length === 0 ? (
						<div style={{ color: "#666", fontStyle: "italic" }}>
							No messages yet. Type a message below to test the interface.
						</div>
					) : (
						messages.map((msg, index) => (
							<div
								key={index}
								style={{
									padding: "8px",
									marginBottom: "5px",
									backgroundColor: "#e3f2fd",
									borderRadius: "4px",
									borderLeft: "3px solid #2196f3",
								}}>
								{msg}
							</div>
						))
					)}
				</div>

				<div style={{ display: "flex", gap: "10px" }}>
					<input
						type="text"
						value={message}
						onChange={(e) => setMessage(e.target.value)}
						onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
						placeholder="Type a message..."
						style={{
							flex: 1,
							padding: "10px",
							border: "1px solid #ccc",
							borderRadius: "4px",
							fontSize: "14px",
						}}
					/>
					<button
						onClick={handleSendMessage}
						style={{
							padding: "10px 20px",
							backgroundColor: "#2196f3",
							color: "white",
							border: "none",
							borderRadius: "4px",
							cursor: "pointer",
							fontSize: "14px",
						}}>
						Send
					</button>
				</div>
			</div>

			<div
				style={{
					marginTop: "20px",
					padding: "15px",
					backgroundColor: "#e8f4fd",
					borderRadius: "8px",
					border: "1px solid #bee5eb",
				}}>
				<h4 style={{ marginTop: 0, color: "#0c5460" }}>Port Management System</h4>
				<p style={{ margin: "5px 0", color: "#0c5460" }}>
					✅ Port registry established with standardized assignments
				</p>
				<p style={{ margin: "5px 0", color: "#0c5460" }}>
					✅ Conflict detection and resolution scripts implemented
				</p>
				<p style={{ margin: "5px 0", color: "#0c5460" }}>
					✅ Web UI successfully running on designated port 5173
				</p>
			</div>
		</div>
	)
}

export default App
