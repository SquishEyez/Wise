import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import pkg from "./package.json" with { type: "json" };

export default defineConfig({
  base: "./", // relative paths: works on GitHub Pages sub-paths and inside the Android app
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react(), wasm(), nodePolyfills({ include: ["buffer", "process", "util", "stream", "events"] })],
  build: { target: "esnext" },
  optimizeDeps: { esbuildOptions: { target: "esnext" } },
  server: { fs: { allow: [".."] } },
});
