import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@bindings": path.resolve(__dirname, "./src/bindings"),
    },
  },
  // Tauri expects a fixed port; if not available, fall back.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: false,
    host: "127.0.0.1",
    // HMR fixes for Tauri
    hmr: {
      protocol: "ws",
      host: "127.0.0.1",
      port: 1421,
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2022",
    minify: "esbuild",
    sourcemap: false,
  },
});
