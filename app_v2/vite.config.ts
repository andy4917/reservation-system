import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  root: path.resolve(__dirname, "renderer"),
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, "..", "dist-app", "app_v2", "renderer"),
    emptyOutDir: true
  },
  server: {
    port: 4173,
    strictPort: true
  }
});
