import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    hmr: {
      protocol: 'ws',
      host: 'localhost',
    },
  },
  // Prevent Vite from pre-bundling ONNX runtime files.
  // @xenova/transformers bundles ort-web with webpack internally;
  // Vite's ESM transform breaks webpack's __webpack_require__ globals.
  // Dynamic import() with @vite-ignore in embeddingService.js handles
  // the static-analysis side; this handles dependency crawling.
  optimizeDeps: {
    exclude: ['@xenova/transformers', 'onnxruntime-web'],
  },
  assetsInclude: ['**/*.wasm'],
});