const axios = require("axios")

async function testRemoteSession() {
	console.log("🧪 Testing Remote Session Creation...")

	try {
		// Test 1: Check CCS server health
		console.log("\n1. Testing CCS Server Health...")
		const healthResponse = await axios.get("http://localhost:3001/health")
		console.log("✅ CCS Server Health:", healthResponse.data)

		// Test 2: Try to create a remote session
		console.log("\n2. Testing Remote Session Creation...")
		try {
			const sessionResponse = await axios.post("http://localhost:3001/api/v1/remote/session", {
				deviceType: "browser",
				userAgent: "test-client",
			})
			console.log("✅ Session Created:", sessionResponse.data)

			const sessionId = sessionResponse.data.sessionId
			const remoteUrl = `http://localhost:3001/remote/${sessionId}`
			console.log(`🌐 Remote URL: ${remoteUrl}`)

			// Test 3: Try to access the remote UI
			console.log("\n3. Testing Remote UI Access...")
			const uiResponse = await axios.get(remoteUrl)
			console.log("✅ Remote UI accessible, response length:", uiResponse.data.length)
		} catch (sessionError) {
			console.log("❌ Session creation failed:", sessionError.response?.data || sessionError.message)

			// Test alternative: Try accessing with a test session ID
			console.log("\n3. Testing with test session ID...")
			const testSessionId = "test-session-" + Date.now()
			const testUrl = `http://localhost:3001/remote/${testSessionId}`

			try {
				const testResponse = await axios.get(testUrl)
				console.log("✅ Test session accessible:", testResponse.status)
				console.log(`🌐 You can access remote UI at: ${testUrl}`)
			} catch (testError) {
				console.log("❌ Test session failed:", testError.response?.data || testError.message)
			}
		}

		// Test 4: Check available endpoints
		console.log("\n4. Available Endpoints:")
		console.log("- Health: http://localhost:3001/health")
		console.log("- Detailed Health: http://localhost:3001/health/detailed")
		console.log("- API Info: http://localhost:3001/api")
		console.log("- Remote Session: http://localhost:3001/remote/{sessionId}")
	} catch (error) {
		console.error("❌ CCS Server not accessible:", error.message)
		console.log("\n🔧 Troubleshooting:")
		console.log("1. Make sure CCS server is running: cd production-ccs && npm start")
		console.log("2. Check if port 3001 is available")
		console.log("3. Verify server logs for errors")
	}
}

testRemoteSession().catch(console.error)
