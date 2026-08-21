/**
 * semanticMatchingService.js
 *
 * Main orchestration layer for AI-powered semantic job matching.
 *
 * Hybrid scoring formula (dynamically loaded from config):
 *   Final Score = (Semantic Cosine Score × SemanticWeight) + 
 *                 (Rule-Based Skill Score × SkillsWeight) + 
 *                 (ATS Score × AtsWeight)
 */

import { supabase }                  from '../supabase.js'
import { findMatchingJobsForCandidate, cosineSimilarity } from './vectorSearchService.js'
import { generateMatchRecommendation }  from './recommendationService.js'
import { normalizeSkillName }           from '../normalization.js'
import { SEMANTIC_MATCHING_CONFIG }    from './semanticMatchingConfig.js'
import { calculateJobFit }             from './jobFitEngine.js'
import { ensureOpenJobEmbeddings }     from './embeddingService.js'
import { fetchSuspendedEmployerIds, filterAvailableJobs } from '../jobAvailability.js'

/**
 * In-memory request deduplication maps.
 * Prevents concurrent duplicate executions caused by React StrictMode or multiple component mounts.
 */
const activeRefreshPromises = new Map();
const activeMatchingPromises = new Map();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parses candidate skills from database JSON. Supports both legacy flat strings
 * and new rich skill objects for backward compatibility.
 */
export function parseSkills(raw) {
  if (!raw) return []
  let parsed = raw
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    } catch {
      return raw.split(',').map(s => s.trim()).filter(Boolean)
    }
  }
  if (!Array.isArray(parsed)) return []
  return parsed.map(item => {
    if (typeof item === 'string') return item.trim()
    if (item && typeof item === 'object') return (item.name || item.skill || '').trim()
    return ''
  }).filter(Boolean)
}

/**
 * Rule-based skill matching helper.
 * Calculates matching, missing, and extra skills along with a 0-100 score.
 */
export function getRuleBasedSkillScore(candidateSkills, requiredSkills) {
  const cNorm = (candidateSkills || []).map(normalizeSkillName).filter(Boolean)
  const rNorm = (requiredSkills  || []).map(normalizeSkillName).filter(Boolean)

  if (rNorm.length === 0) {
    return { score: 100, matchingSkills: candidateSkills || [], missingSkills: [] }
  }

  const cSet = new Set(cNorm)
  const matching = []
  const missing  = []

  rNorm.forEach((skill, idx) => {
    const orig = requiredSkills[idx] || skill
    if (cSet.has(skill)) {
      matching.push(orig)
    } else {
      missing.push(orig)
    }
  })

  const score = Math.round((matching.length / rNorm.length) * 100)
  return { score, matchingSkills: matching, missingSkills: missing }
}

// ─── Main Orchestrator ────────────────────────────────────────────────────────

/**
 * Candidate side: Run semantic matching for a specific candidate against ALL active open jobs.
 * Called automatically after a resume is uploaded.
 * Features in-memory request deduplication for concurrent triggers.
 *
 * @param {string}   userId          - candidate's Supabase auth user ID
 * @param {number[]} resumeEmbedding - 384-dim float array (just generated)
 */
export async function runSemanticMatchingForCandidate(userId, resumeEmbedding) {
  if (!userId) return;

  if (activeMatchingPromises.has(userId)) {
    console.log('[SemanticMatching] Deduplicating concurrent runSemanticMatchingForCandidate for candidate:', userId);
    return activeMatchingPromises.get(userId);
  }

  const promise = (async () => {
    const tStart = performance.now();
    console.log('[SemanticMatching] Starting for candidate:', userId)

    try {
      // 0. Ensure open jobs have embeddings generated (auto-backfill if needed)
      await ensureOpenJobEmbeddings().catch(console.warn);

      // ── 1. Vector search: find top 20 semantically similar jobs ──────────────
      const tFindStart = performance.now();
      const vectorResults = await findMatchingJobsForCandidate(resumeEmbedding, 20)
      const dFind = performance.now() - tFindStart;

      const similarityMap = {}
      let jobs = []

      if (vectorResults && vectorResults.length > 0) {
        const jobIds = vectorResults.map(r => r.job_id)
        vectorResults.forEach(r => { similarityMap[r.job_id] = r.similarity })

        const { data: fetchedJobs } = await supabase.from('jobs').select('*').in('id', jobIds).eq('status', 'open')
        jobs = fetchedJobs || []
      }

      // Fallback: If vector search yielded no jobs (e.g. no job embeddings exist yet), fetch all open jobs!
      if (!jobs || jobs.length === 0) {
        console.log('[SemanticMatching] Vector search produced no jobs — falling back to querying all open jobs.')
        const { data: openJobs } = await supabase.from('jobs').select('*').eq('status', 'open')
        jobs = openJobs || []
      }

      // Filter out open jobs from suspended employers
      if (jobs && jobs.length > 0) {
        const employerIds = jobs.map(j => j.employer_id).filter(Boolean);
        const suspendedSet = await fetchSuspendedEmployerIds(supabase, employerIds);
        jobs = filterAvailableJobs(jobs, suspendedSet);
      }

      const tFetchStart = performance.now();
      const { data: candidateProfile } = await supabase
        .from('candidate_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle()
      const dFetch = performance.now() - tFetchStart;

      if (!jobs || !jobs.length) {
        console.log('[SemanticMatching] Job details not found or all employers suspended.')
        return
      }

      // Safely parse candidate skills (handles objects or string list)
      const tCalcStart = performance.now();
      const candidateObj = candidateProfile || {};

      // ── 3. Build unified Job Fit scores for each open job ────────────────────
      const upserts = jobs.map(job => {
        let semanticSim = similarityMap[job.id];

        // Calculate real cosine similarity if not returned by RPC
        if (semanticSim === undefined || semanticSim === null) {
          if (job.job_embedding && Array.isArray(resumeEmbedding)) {
            const jobVec = Array.isArray(job.job_embedding)
              ? job.job_embedding
              : (typeof job.job_embedding === 'string' ? JSON.parse(job.job_embedding) : null);

            if (jobVec && jobVec.length === resumeEmbedding.length) {
              semanticSim = cosineSimilarity(resumeEmbedding, jobVec);
            } else {
              semanticSim = 0; // Real 0 when embedding unavailable - no fabrication!
            }
          } else {
            semanticSim = 0; // Real 0 when embedding unavailable - no fabrication!
          }
        }

        const fitResult = calculateJobFit(candidateObj, job, semanticSim);

        const recommendationStr = fitResult.strengths.length > 0
          ? `${fitResult.tier}: ${fitResult.strengths.join('; ')}`
          : `${fitResult.tier}: Alignment evaluated against role qualifications.`;

        return {
          user_id:         userId,
          job_id:          job.id,
          match_score:     fitResult.jobFitScore,
          semantic_score:  fitResult.breakdown.semanticRelevance,
          skills_score:    fitResult.breakdown.requiredSkillsScore,
          education_score: fitResult.breakdown.educationCompatibility,
          experience_score: fitResult.breakdown.experienceCompatibility,
          match_status:    fitResult.tier,
          matching_skills: fitResult.matchedSkills,
          missing_skills:  fitResult.missingSkills,
          strengths:       fitResult.strengths,
          recommendations: recommendationStr,
          match_reason:     recommendationStr,
          micro_credentials: fitResult.recommendedMicrocredentials,
          matched_certs:   fitResult.matchedCertifications,
          match_type:      'semantic',
          updated_at:      new Date().toISOString(),
        }
      })
      const dCalc = performance.now() - tCalcStart;

      // ── 4. Upsert results ─────────────────────────────────────────────────────
      const tUpsertStart = performance.now();
      const { error } = await supabase
        .from('job_matches')
        .upsert(upserts, { onConflict: 'user_id,job_id' })
      const dUpsert = performance.now() - tUpsertStart;

      const dTotal = performance.now() - tStart;
      console.log(`[Perf-SemanticMatching] runSemanticMatchingForCandidate Complete:
        - Vector Search Database Fetch: ${dFind.toFixed(2)}ms
        - Details (Jobs, Profile, Resume) fetch: ${dFetch.toFixed(2)}ms
        - Match Score Calculations: ${dCalc.toFixed(2)}ms
        - Supabase Upserts: ${dUpsert.toFixed(2)}ms
        - runSemanticMatchingForCandidate() Total: ${dTotal.toFixed(2)}ms`);

      if (error) {
        console.error('[SemanticMatching] Upsert error:', error.message)
      } else {
        console.log(`[SemanticMatching] Saved ${upserts.length} semantic matches for candidate ${userId}`)

        // ── 5. Notify high matches (≥80%) ──────────────────────────────────────
        const highMatches = upserts.filter(u => u.match_score >= 80)
        if (highMatches.length > 0) {
          const best = highMatches[0]
          const bestJob = jobs.find(j => j.id === best.job_id)
          await supabase.from('notifications').insert([{
            user_id: userId,
            title:   `🔥 ${highMatches.length} High AI Match${highMatches.length > 1 ? 'es' : ''} Found!`,
            message: `Your resume is a ${best.match_score}% AI match for "${bestJob?.title || 'a job'}". Check your AI Job Matches!`,
            type:    'job_match',
          }])
        }
      }
    } catch (err) {
      console.error('[SemanticMatching] Unexpected error:', err)
    } finally {
      activeMatchingPromises.delete(userId);
    }
  })();

  activeMatchingPromises.set(userId, promise);
  return promise;
}

/**
 * Fetch semantic match results for the candidate's AI Matches page.
 * Returns jobs sorted by semantic_score descending.
 *
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
export async function fetchSemanticMatchesForCandidate(userId) {
  if (!userId) return [];

  const { data, error } = await supabase
    .from('job_matches')
    .select('*, jobs!inner(*)')
    .eq('user_id', userId)
    .eq('match_type', 'semantic')
    .order('match_score', { ascending: false })

  if (error) {
    console.error('[SemanticMatching] fetchSemanticMatchesForCandidate:', error.message)
    return []
  }

  const rawMatches = (data || []).filter(m => m.jobs?.status === 'open');
  const employerIds = rawMatches.map(m => m.jobs?.employer_id).filter(Boolean);
  const suspendedSet = await fetchSuspendedEmployerIds(supabase, employerIds);

  return rawMatches
    .filter(m => !suspendedSet.has(m.jobs?.employer_id))
    .map((m, idx) => ({
      ...m.jobs,
      rank:            idx + 1,
      matchScore:      m.match_score      ?? 0,
      matchStatus:     m.match_status     ?? 'Recommended',
      semanticScore:   m.semantic_score   ?? 0,
      skillsScore:     m.skills_score     ?? 0,
      educationScore:  m.education_score  ?? 100,
      experienceScore: m.experience_score ?? 100,
      matchedSkills:   Array.isArray(m.matching_skills) ? m.matching_skills : (m.matching_skills ? JSON.parse(m.matching_skills) : []),
      missingSkills:   Array.isArray(m.missing_skills)  ? m.missing_skills  : (m.missing_skills  ? JSON.parse(m.missing_skills)  : []),
      strengths:       Array.isArray(m.strengths)        ? m.strengths       : (m.strengths        ? JSON.parse(m.strengths)        : []),
      recommendations: m.recommendations ?? '',
      matchReason:     m.match_reason     ?? '',
      microCredentials: Array.isArray(m.micro_credentials) ? m.micro_credentials : (m.micro_credentials ? (typeof m.micro_credentials === 'string' ? JSON.parse(m.micro_credentials) : []) : []),
      matchedCerts:     Array.isArray(m.matched_certs)     ? m.matched_certs     : (m.matched_certs     ? (typeof m.matched_certs     === 'string' ? JSON.parse(m.matched_certs)     : []) : []),
    }))
}

/**
 * Re-evaluates all currently active open jobs against the candidate's existing
 * parsed resume / profile without requiring a resume re-upload.
 * Features in-memory deduplication to prevent duplicate execution.
 *
 * @param {string} userId
 * @returns {Promise<{ matches: object[], totalEvaluatedJobs: number }>}
 */
export async function refreshCandidateRecommendations(userId) {
  if (!userId) return { matches: [], totalEvaluatedJobs: 0 };

  if (activeRefreshPromises.has(userId)) {
    console.log('[SemanticMatching] Deduplicating concurrent refreshCandidateRecommendations for candidate:', userId);
    return activeRefreshPromises.get(userId);
  }

  const promise = (async () => {
    try {
      console.log('[SemanticMatching] Refreshing recommendations for candidate:', userId);

      // 1. Fetch open jobs count
      const { data: openJobs } = await supabase
        .from('jobs')
        .select('id, job_embedding')
        .eq('status', 'open');

      const totalEvaluatedJobs = openJobs?.length || 0;

      // 2. Fetch candidate resume row for embedding
      const { data: resumeRow } = await supabase
        .from('resumes')
        .select('resume_embedding, extracted_skills')
        .eq('applicant_id', userId)
        .maybeSingle();

      let resumeEmbedding = null;
      if (resumeRow?.resume_embedding) {
        if (Array.isArray(resumeRow.resume_embedding)) {
          resumeEmbedding = resumeRow.resume_embedding;
        } else if (typeof resumeRow.resume_embedding === 'string') {
          try {
            resumeEmbedding = JSON.parse(resumeRow.resume_embedding);
          } catch {
            resumeEmbedding = null;
          }
        }
      }

      // 3. Run semantic or standard candidate matching across all open jobs
      if (resumeEmbedding && Array.isArray(resumeEmbedding) && resumeEmbedding.length > 0) {
        await runSemanticMatchingForCandidate(userId, resumeEmbedding);
      } else {
        const { runMatchingForCandidate } = await import('../matchingEngine.js');
        await runMatchingForCandidate(userId);
      }

      // 4. Fetch updated matches
      const matches = await fetchSemanticMatchesForCandidate(userId);
      return { matches, totalEvaluatedJobs };
    } finally {
      activeRefreshPromises.delete(userId);
    }
  })();

  activeRefreshPromises.set(userId, promise);
  return promise;
}
