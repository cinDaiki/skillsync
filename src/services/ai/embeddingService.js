/**
 * embeddingService.js  (v4 — CDN load, bypasses Vite transformer entirely)
 *
 * ROOT CAUSE of the recurring "registerBackend" crash:
 *   @xenova/transformers bundles ort-web using webpack, which sets up its own
 *   module system (__webpack_require__, registerBackend, etc.) via an IIFE.
 *   Vite's dev server transforms EVERY JS file it serves — including those in
 *   node_modules — wrapping them in ESM. This breaks ort-web's webpack bootstrap
 *   regardless of optimizeDeps.exclude or dynamic import() tricks, because Vite
 *   still intercepts the request at the network level.
 *
 * THE FIX:
 *   Load @xenova/transformers from a CDN URL. When the browser fetches an
 *   external HTTPS URL, Vite's dev server is NOT involved — the browser fetches
 *   directly from jsDelivr. The webpack IIFE in ort-web executes as-is, its
 *   globals are properly initialised, and the model loads correctly.
 *
 * Model: Xenova/all-MiniLM-L6-v2 (quantized ≈ 25 MB, cached in IndexedDB)
 * Output: float32[384], L2-normalised
 */

import { supabase } from '../supabase'

// ── CDN URL ────────────────────────────────────────────────────────────────
// Pinned to the same version installed in package.json (2.17.2).
// jsDelivr serves the npm dist file directly; Vite never intercepts it.
const TRANSFORMERS_CDN =
  'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js'

// ── Singleton ──────────────────────────────────────────────────────────────
let _extractor = null
const progressListeners = new Set()

export function onEmbeddingProgress(fn)  { progressListeners.add(fn) }
export function offEmbeddingProgress(fn) { progressListeners.delete(fn) }

async function getExtractor() {
  if (_extractor) return _extractor

  // Load from CDN — bypasses Vite dev server, webpack globals stay intact
  // eslint-disable-next-line no-undef
  const { pipeline, env } = await import(/* @vite-ignore */ TRANSFORMERS_CDN)

  env.allowLocalModels = false
  env.useBrowserCache  = true   // caches model in browser IndexedDB

  _extractor = await pipeline(
    'feature-extraction',
    'Xenova/all-MiniLM-L6-v2',
    {
      quantized:         true,
      progress_callback: (p) => progressListeners.forEach(fn => fn(p)),
    }
  )

  console.log('[EmbeddingService] Model loaded ✓')
  return _extractor
}

// ── Core API ──────────────────────────────────────────────────────────────

/**
 * Generate a 384-dim L2-normalised embedding.
 * Lazy-loads the model on first call (~25 MB download, cached permanently).
 *
 * @param {string} text
 * @returns {Promise<number[]>}
 */
export async function generateEmbedding(text) {
  if (!text?.trim()) throw new Error('Cannot embed empty text')

  const extractor = await getExtractor()
  const truncated = text.trim().slice(0, 2048)   // ≈ 512 tokens

  const output = await extractor(truncated, {
    pooling:   'mean',
    normalize: true,
  })

  return Array.from(output.data)
}

// ── Text builders ─────────────────────────────────────────────────────────

/**
 * Build a compact text blob for a resume to embed.
 */
export function buildResumeTextForEmbedding(analysis, rawText = '') {
  const parts = []
  if (analysis?.details?.degree)  parts.push(`Degree: ${analysis.details.degree}`)
  if (analysis?.details?.course)  parts.push(`Course: ${analysis.details.course}`)
  if (analysis?.skills?.length)   parts.push(`Skills: ${analysis.skills.join(', ')}`)
  if (analysis?.details?.yearsOfExperience > 0)
    parts.push(`Experience: ${analysis.details.yearsOfExperience} years`)
  if (analysis?.details?.hasExperienceSection)     parts.push('Has work experience')
  if (analysis?.details?.hasCertificationsSection) parts.push('Has certifications')
  if (rawText) parts.push(rawText.slice(0, 800))
  return parts.join('. ')
}

/**
 * Build a compact text blob for a job posting to embed.
 */
export function buildJobTextForEmbedding(job) {
  return [
    job.title,
    job.description,
    job.required_skills     ? `Required skills: ${job.required_skills}`  : '',
    job.required_education  ? `Education: ${job.required_education}`     : '',
    job.experience_required ? `Experience: ${job.experience_required}`   : '',
    job.employment_type,
    job.work_setup,
  ].filter(Boolean).join('. ')
}

// ── Supabase persistence ──────────────────────────────────────────────────

/**
 * Generate and store a resume embedding in resumes.resume_embedding.
 */
export async function generateAndStoreResumeEmbedding(userId, text) {
  try {
    const embedding = await generateEmbedding(text)

    const { error } = await supabase
      .from('resumes')
      .update({
        resume_embedding:       embedding,
        embedding_generated_at: new Date().toISOString(),
      })
      .eq('applicant_id', userId)

    if (error) {
      console.error('[EmbeddingService] Store resume embedding:', error.message)
      return { embedding: null, error }
    }

    console.log('[EmbeddingService] Resume embedding stored ✓')
    return { embedding, error: null }
  } catch (err) {
    console.error('[EmbeddingService] generateAndStoreResumeEmbedding:', err.message)
    return { embedding: null, error: err }
  }
}

/**
 * Generate and store a job embedding in jobs.job_embedding.
 */
export async function generateAndStoreJobEmbedding(jobId, text) {
  try {
    const embedding = await generateEmbedding(text)

    const { error } = await supabase
      .from('jobs')
      .update({
        job_embedding:          embedding,
        embedding_generated_at: new Date().toISOString(),
      })
      .eq('id', jobId)

    if (error) {
      console.error('[EmbeddingService] Store job embedding:', error.message)
      return { embedding: null, error }
    }

    console.log('[EmbeddingService] Job embedding stored ✓')
    return { embedding, error: null }
  } catch (err) {
    console.error('[EmbeddingService] generateAndStoreJobEmbedding:', err.message)
    return { embedding: null, error: err }
  }
}
