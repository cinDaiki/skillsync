/**
 * vectorSearchService.js
 *
 * Thin wrapper around Supabase pgvector RPC functions.
 * Converts JS float arrays to pgvector string format and calls the DB functions.
 */

import { supabase } from '../supabase'

/**
 * Convert a JS float array to the pgvector literal format: "[0.1,0.2,...]"
 */
function toVectorLiteral(embedding) {
  return `[${embedding.join(',')}]`
}

/**
 * Cosine similarity of two L2-normalized vectors (= dot product when normalized).
 * Used client-side for employer applicant ranking.
 */
export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  return Math.max(0, Math.min(1, dot)) // clamp to [0, 1]
}

/**
 * Find the most semantically similar open jobs for a candidate resume.
 * Calls the match_jobs_for_candidate Supabase RPC (pgvector cosine search).
 *
 * @param {number[]} resumeEmbedding - 384-dim float array
 * @param {number}   limit           - max jobs to return
 * @returns {Promise<Array<{job_id: string, similarity: number}>>}
 */
export async function findMatchingJobsForCandidate(resumeEmbedding, limit = 20) {
  try {
    const { data, error } = await supabase.rpc('match_jobs_for_candidate', {
      query_embedding: toVectorLiteral(resumeEmbedding),
      match_count:     limit,
    })

    if (error) {
      console.error('[VectorSearch] match_jobs_for_candidate error:', error.message)
      return []
    }

    return data || []
  } catch (err) {
    console.error('[VectorSearch] Unexpected error:', err)
    return []
  }
}

/**
 * Fetch resume embeddings for a list of applicant IDs (for employer ranking).
 * Returns a map of { applicantId → float[] }.
 *
 * @param {string[]} applicantIds
 * @returns {Promise<Record<string, number[]>>}
 */
export async function fetchResumeEmbeddings(applicantIds) {
  if (!applicantIds?.length) return {}

  try {
    const { data, error } = await supabase
      .from('resumes')
      .select('applicant_id, resume_embedding')
      .in('applicant_id', applicantIds)
      .not('resume_embedding', 'is', null)

    if (error) {
      console.error('[VectorSearch] fetchResumeEmbeddings error:', error.message)
      return {}
    }

    const map = {}
    ;(data || []).forEach(row => {
      if (row.resume_embedding) {
        // pgvector returns the vector as a JS array already via PostgREST
        map[row.applicant_id] = Array.isArray(row.resume_embedding)
          ? row.resume_embedding
          : JSON.parse(row.resume_embedding)
      }
    })

    return map
  } catch (err) {
    console.error('[VectorSearch] Unexpected error:', err)
    return {}
  }
}

/**
 * Fetch the job embedding for a specific job.
 *
 * @param {string} jobId
 * @returns {Promise<number[]|null>}
 */
export async function fetchJobEmbedding(jobId) {
  try {
    const { data, error } = await supabase
      .from('jobs')
      .select('job_embedding')
      .eq('id', jobId)
      .maybeSingle()

    if (error || !data?.job_embedding) return null

    return Array.isArray(data.job_embedding)
      ? data.job_embedding
      : JSON.parse(data.job_embedding)
  } catch {
    return null
  }
}
