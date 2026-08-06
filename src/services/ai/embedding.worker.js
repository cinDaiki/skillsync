/**
 * embedding.worker.js — DEPRECATED
 *
 * This file is no longer used. The embedding pipeline now runs directly on
 * the main thread via embeddingService.js to avoid an incompatibility between
 * @xenova/transformers (ort-web webpack bundle) and Vite's ES module Web Worker.
 *
 * Error it caused: "Cannot read properties of undefined (reading 'registerBackend')"
 */
