import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { resolve } from "path"
// import { VitePWA } from "vite-plugin-pwa"

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		react(),
		// Temporarily disable PWA for testing
		// VitePWA({
		// 	registerType: "autoUpdate",
		// 	workbox: {
		// 		globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
		// 	},
		// 	includeAssets: ["favicon.ico", "apple-touch-icon.png", "masked-icon.svg"],
		// 	manifest: {
		// 		name: "Roo-Code Remote",
		// 		short_name: "RooCode",
		// 		description: "Remote access interface for Roo-Code extension",
		// 		theme_color: "#ffffff",
		// 		icons: [
		// 			{
		// 				src: "pwa-192x192.png",
		// 				sizes: "192x192",
		// 				type: "image/png",
		// 			},
		// 			{
		// 				src: "pwa-512x512.png",
		// 				sizes: "512x512",
		// 				type: "image/png",
		// 			},
		// 		],
		// 	},
		// }),
	],
	resolve: {
		alias: {
			"@": resolve(__dirname, "./src"),
			"@webview-ui": resolve(__dirname, "../webview-ui/src"),
			"@roo": resolve(__dirname, "../src/shared"),
			"@roo-code/types": resolve(__dirname, "../packages/types/src"),
		},
	},
	server: {
		port: 5173,
		host: true,
		cors: true,
		proxy: {
			"/api": {
				target: "http://localhost:3001",
				changeOrigin: true,
				secure: false,
			},
			"/ws": {
				target: "ws://localhost:3001",
				ws: true,
				changeOrigin: true,
			},
		},
	},
	publicDir: "public",
	build: {
		outDir: "dist",
		sourcemap: true,
		rollupOptions: {
			input: "./public/index.html",
			output: {
				manualChunks: {
					vendor: ["react", "react-dom"],
					router: ["react-router-dom"],
					query: ["@tanstack/react-query"],
				},
			},
		},
	},
	optimizeDeps: {
		include: ["react", "react-dom", "react-router-dom", "@tanstack/react-query"],
	},
})
