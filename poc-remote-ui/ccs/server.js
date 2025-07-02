const express = require("express")
const path = require("path")
const cors = require("cors")
const ipc = require("node-ipc")

// Initialize Express app
const app = express()
const PORT = process.env.PORT || 8081

// Configure IPC
ipc.config.id = "roo-remote-poc"
ipc.config.retry = 1500
ipc.config.silent = false

// Middleware
app.use(cors())

// Custom JSON parsing middleware with error handling
app.use("/send-message", (req, res, next) => {
	express.json()(req, res, (err) => {
		if (err) {
			console.error("🚨 JSON parsing error:", err.message)
			return res.status(400).json({
				success: false,
				message: "Invalid JSON format",
				error: "Request body must be valid JSON",
			})
		}
		next()
	})
})

// Standard JSON middleware for other routes
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static(path.join(__dirname, "public")))

// Store connection status
let ipcConnected = false
let messageQueue = []

// IPC Connection Management
function connectToRooExtension() {
	console.log("Attempting to connect to Roo extension via IPC...")

	ipc.connectTo("roo-extension", () => {
		ipc.of["roo-extension"].on("connect", () => {
			console.log("✅ Connected to Roo extension via IPC")
			ipcConnected = true

			// Process any queued messages
			if (messageQueue.length > 0) {
				console.log(`Processing ${messageQueue.length} queued messages`)
				messageQueue.forEach((message) => {
					sendMessageToRoo(message.text, message.res)
				})
				messageQueue = []
			}
		})

		ipc.of["roo-extension"].on("disconnect", () => {
			console.log("❌ Disconnected from Roo extension")
			ipcConnected = false
		})

		ipc.of["roo-extension"].on("message-received", (data) => {
			console.log("📨 Response from Roo extension:", data)
		})

		ipc.of["roo-extension"].on("error", (error) => {
			console.error("🚨 IPC Error:", error)
			ipcConnected = false
		})
	})
}

// Send message to Roo extension
function sendMessageToRoo(messageText, res) {
	if (!ipcConnected) {
		console.log("⏳ IPC not connected, queueing message:", messageText)
		messageQueue.push({ text: messageText, res: res })

		if (res) {
			res.json({
				success: false,
				message: "IPC not connected, message queued",
				queued: true,
			})
		}
		return
	}

	try {
		console.log("📤 Sending message to Roo extension:", messageText)

		ipc.of["roo-extension"].emit("remote-message", {
			text: messageText,
			timestamp: new Date().toISOString(),
		})

		if (res) {
			res.json({
				success: true,
				message: "Message sent to Roo extension",
				text: messageText,
			})
		}
	} catch (error) {
		console.error("🚨 Error sending message:", error)

		if (res) {
			res.status(500).json({
				success: false,
				message: "Error sending message to Roo extension",
				error: error.message,
			})
		}
	}
}

// Routes
app.get("/", (req, res) => {
	res.sendFile(path.join(__dirname, "public", "index.html"))
})

app.get("/status", (req, res) => {
	res.json({
		server: "running",
		ipcConnected: ipcConnected,
		queuedMessages: messageQueue.length,
		timestamp: new Date().toISOString(),
	})
})

app.post("/send-message", (req, res) => {
	const { message } = req.body

	if (!message || message.trim() === "") {
		return res.status(400).json({
			success: false,
			message: "Message text is required",
		})
	}

	console.log("📥 Received message from client:", message)
	sendMessageToRoo(message.trim(), res)
})

// Health check endpoint
app.get("/health", (req, res) => {
	res.json({
		status: "healthy",
		uptime: process.uptime(),
		timestamp: new Date().toISOString(),
		ipc: {
			connected: ipcConnected,
			queuedMessages: messageQueue.length,
			socketPath: "/tmp/app.roo-extension",
		},
	})
})

// Error handling middleware
app.use((error, req, res, next) => {
	console.error("🚨 Server error:", error)
	res.status(500).json({
		success: false,
		message: "Internal server error",
		error: process.env.NODE_ENV === "development" ? error.message : "Something went wrong",
	})
})

// 404 handler
app.use((req, res) => {
	res.status(404).json({
		success: false,
		message: "Endpoint not found",
	})
})

// Start server
app.listen(PORT, () => {
	console.log(`🚀 Roo Remote UI PoC Server running on http://localhost:${PORT}`)
	console.log(`📊 Status endpoint: http://localhost:${PORT}/status`)
	console.log(`🏥 Health endpoint: http://localhost:${PORT}/health`)

	// Attempt IPC connection after server starts
	setTimeout(() => {
		connectToRooExtension()
	}, 1000)
})

// Graceful shutdown
process.on("SIGINT", () => {
	console.log("\n🛑 Shutting down server...")

	if (ipc.of["roo-extension"]) {
		ipc.disconnect("roo-extension")
	}

	process.exit(0)
})

process.on("SIGTERM", () => {
	console.log("\n🛑 Received SIGTERM, shutting down gracefully...")

	if (ipc.of["roo-extension"]) {
		ipc.disconnect("roo-extension")
	}

	process.exit(0)
})
