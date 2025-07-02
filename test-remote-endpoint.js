const http = require("http")

// Test the remote endpoint
function testRemoteEndpoint() {
	const options = {
		hostname: "localhost",
		port: 3001,
		path: "/remote/test_session_123",
		method: "GET",
		headers: {
			"Content-Type": "text/html",
			"User-Agent": "Test-Client/1.0",
		},
	}

	console.log("Testing remote endpoint: GET http://localhost:3001/remote/test_session_123")

	const req = http.request(options, (res) => {
		console.log(`Status Code: ${res.statusCode}`)
		console.log(`Headers:`, res.headers)

		let data = ""
		res.on("data", (chunk) => {
			data += chunk
		})

		res.on("end", () => {
			console.log("\n--- Response Body ---")
			if (res.headers["content-type"]?.includes("text/html")) {
				console.log("HTML Response received (truncated):")
				console.log(data.substring(0, 200) + "...")
			} else {
				console.log("JSON Response:")
				try {
					const jsonData = JSON.parse(data)
					console.log(JSON.stringify(jsonData, null, 2))
				} catch (e) {
					console.log("Raw response:", data)
				}
			}
		})
	})

	req.on("error", (error) => {
		console.error("Request error:", error.message)
	})

	req.end()
}

// Test the status endpoint
function testStatusEndpoint() {
	const options = {
		hostname: "localhost",
		port: 3001,
		path: "/remote/test_session_123/status",
		method: "GET",
		headers: {
			"Content-Type": "application/json",
			"User-Agent": "Test-Client/1.0",
		},
	}

	console.log("\nTesting status endpoint: GET http://localhost:3001/remote/test_session_123/status")

	const req = http.request(options, (res) => {
		console.log(`Status Code: ${res.statusCode}`)

		let data = ""
		res.on("data", (chunk) => {
			data += chunk
		})

		res.on("end", () => {
			console.log("\n--- Status Response ---")
			try {
				const jsonData = JSON.parse(data)
				console.log(JSON.stringify(jsonData, null, 2))
			} catch (e) {
				console.log("Raw response:", data)
			}
		})
	})

	req.on("error", (error) => {
		console.error("Request error:", error.message)
	})

	req.end()
}

// Run tests
console.log("🧪 Testing Remote UI Endpoints")
console.log("================================")

testRemoteEndpoint()

setTimeout(() => {
	testStatusEndpoint()
}, 1000)
