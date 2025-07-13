function AppDebug() {
	return (
		<div
			style={{
				padding: "20px",
				fontFamily: "Arial, sans-serif",
				maxWidth: "800px",
				margin: "0 auto",
			}}>
			<h1>Roo-Code Remote UI - Debug Mode</h1>
			<p>This is a simple debug version to test if React is working properly.</p>

			<div
				style={{
					background: "#f5f5f5",
					padding: "15px",
					borderRadius: "5px",
					marginTop: "20px",
				}}>
				<h2>System Status</h2>
				<ul>
					<li>✅ React is rendering</li>
					<li>✅ Vite dev server is running</li>
					<li>✅ Basic styling is working</li>
				</ul>
			</div>

			<div
				style={{
					background: "#e8f4fd",
					padding: "15px",
					borderRadius: "5px",
					marginTop: "20px",
				}}>
				<h2>Next Steps</h2>
				<p>
					If you can see this page, the basic React setup is working. The issue is likely in the
					authentication flow.
				</p>
			</div>
		</div>
	)
}

export default AppDebug
