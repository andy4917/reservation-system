import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  base: "./",
  root: path.resolve(__dirname, "renderer"),
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, "..", "dist-app", "renderer"),
    emptyOutDir: false
  },
  server: {
    port: 4173,
    strictPort: true
  }
});
