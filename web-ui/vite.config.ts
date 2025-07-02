import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { VitePWA } from "vite-plugin-pwa"
import path from "path"

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		react(),
		VitePWA({
			registerType: "autoUpdate",
			workbox: {
				globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
			},
			includeAssets: ["favicon.ico", "apple-touch-icon.png", "masked-icon.svg"],
			manifest: {
				name: "Roo-Code Remote",
				short_name: "RooCode",
				description: "Remote access interface for Roo-Code extension",
				theme_color: "#ffffff",
				icons: [
					{
						src: "pwa-192x192.png",
						sizes: "192x192",
						type: "image/png",
					},
					{
						src: "pwa-512x512.png",
						sizes: "512x512",
						type: "image/png",
					},
				],
			},
		}),
	],
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
			"@/components": path.resolve(__dirname, "./src/components"),
			"@/utils": path.resolve(__dirname, "./src/utils"),
			"@/adapters": path.resolve(__dirname, "./src/adapters"),
			"@/types": path.resolve(__dirname, "./src/types"),
			"@roo": path.resolve(__dirname, "../webview-ui/src/shared"),
			"@roo-code/types": path.resolve(__dirname, "../packages/shared/src/types"),
		},
	},
	server: {
		port: 3002,
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
	build: {
		outDir: "dist",
		sourcemap: true,
		rollupOptions: {
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
