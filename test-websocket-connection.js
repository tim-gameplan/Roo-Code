#!/usr/bin/env node

const WebSocket = require("ws")

console.log("🔌 Testing WebSocket connection to RCCS server...")
console.log("📍 Connecting to: ws://localhost:3001")

const ws = new WebSocket("ws://localhost:3001")

ws.on("open", function open() {
	console.log("✅ WebSocket connection established successfully!")

	// Test basic message sending
	const testMessage = {
		type: "test",
		payload: {
			message: "Hello RCCS Server!",
			timestamp: new Date().toISOString(),
		},
	}

	console.log("📤 Sending test message:", JSON.stringify(testMessage, null, 2))
	ws.send(JSON.stringify(testMessage))
})

ws.on("message", function message(data) {
	console.log("📥 Received message from server:")
	try {
		const parsed = JSON.parse(data)
		console.log(JSON.stringify(parsed, null, 2))
	} catch (e) {
		console.log("Raw message:", data.toString())
	}
})

ws.on("error", function error(err) {
	console.error("❌ WebSocket error:", err.message)
})

ws.on("close", function close(code, reason) {
	console.log(`🔌 WebSocket connection closed. Code: ${code}, Reason: ${reason || "No reason provided"}`)
	process.exit(0)
})

// Close connection after 5 seconds
setTimeout(() => {
	console.log("⏰ Test complete, closing connection...")
	ws.close()
}, 5000)
