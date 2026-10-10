import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // Preview Backend Isolation Guard:
  // When building in Vercel Preview (VERCEL_ENV === 'preview' or branch build on feature/*),
  // guarantee that the Preview bundle compiles with Staging Supabase (zjzymrpifutqubffvhyt)
  // and NEVER inherits or leaks Production Supabase (blekdvuovbfpuaepjvfq).
  const isVercelPreview = process.env.VERCEL_ENV === 'preview' || 
    (process.env.VERCEL_GIT_COMMIT_REF && process.env.VERCEL_GIT_COMMIT_REF.includes('feature/'));

  const stagingUrl = 'https://zjzymrpifutqubffvhyt.supabase.co';
  const stagingAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqenltcnBpZnV0cXViZmZ2aHl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0MTgzODgsImV4cCI6MjEwNTk5NDM4OH0.D6LLkFwhWYUDih8qpkClfG-V2lwbTl68OvCfob2r_gc';

  const shouldEnforceStaging = isVercelPreview && (!process.env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL !== stagingUrl);

  return {
    plugins: [react()],
    define: shouldEnforceStaging ? {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(stagingUrl),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(stagingAnonKey),
    } : {},
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
  };
});