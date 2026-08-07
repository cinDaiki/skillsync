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
import { findMatchingJobsForCandidate } from './vectorSearchService.js'
import { generateMatchRecommendation }  from './recommendationService.js'
import { normalizeSkillName }           from '../normalization.js'
import { SEMANTIC_MATCHING_CONFIG }    from './semanticMatchingConfig.js'

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
      parsed = raw.split(',').map(s => s.trim())
    }
  }
  if (Array.isArray(parsed)) {
    return parsed.map(s => {
      if (s && typeof s === 'object') {
        // Support rich skill shape: { canonicalName/normalized }
        return normalizeSkillName(s.normalized || s.canonicalName || s.name || '')
      }
      return normalizeSkillName(s)
    }).filter(Boolean)
  }
  return []
}

/**
 * Computes a rule-based skill alignment score. Matches are weighted based on
 * the candidate's skill detection confidence and config policies.
 * 
 * @param {Array<string|object>} candidateSkillsRaw - Raw candidate skills (flat or rich)
 * @param {string[]} jobSkills - Required job skills
 * @param {object} config - Config containing scoring policy
 * @returns {object} { pct, matched, missing }
 */
export function getRuleBasedSkillScore(candidateSkillsRaw, jobSkills, config = SEMANTIC_MATCHING_CONFIG) {
  if (!jobSkills.length) return { pct: 100, matched: [], missing: [] }
  
  const matched = []
  const missing = []
  let totalScore = 0

  const policy = config.scoringPolicy || { minimumConfidenceWeight: 0.5, confidenceScaling: true };

  // Helper to get normalized search name for candidate skill
  const getCandSkillName = (s) => {
    if (s && typeof s === 'object') {
      return normalizeSkillName(s.normalized || s.canonicalName || s.name || '')
    }
    return normalizeSkillName(s)
  }

  jobSkills.forEach(req => {
    // Find matching candidate skill in candidateSkillsRaw
    const match = (candidateSkillsRaw || []).find(c => {
      const candName = getCandSkillName(c)
      const reqName = normalizeSkillName(req)
      return candName.includes(reqName) || reqName.includes(candName)
    })

    if (match) {
      matched.push(req)

      // Calculate weight based on config policy
      if (typeof match === 'object') {
        const confidence = match.confidenceScore !== undefined 
          ? match.confidenceScore / 100 
          : (match.confidence !== undefined ? match.confidence : 1.0);
        
        if (policy.confidenceScaling) {
          // Scale linearly from minimumConfidenceWeight to 1.0
          const weight = policy.minimumConfidenceWeight + (1 - policy.minimumConfidenceWeight) * confidence;
          totalScore += Math.max(policy.minimumConfidenceWeight, Math.min(1.0, weight));
        } else {
          totalScore += policy.minimumConfidenceWeight;
        }
      } else {
        totalScore += 1.0; // flat string has no confidence metadata, assume 1.0
      }
    } else {
      missing.push(req)
    }
  })

  const pct = (totalScore / jobSkills.length) * 100
  return { pct: Math.round(pct), matched, missing }
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Run semantic + hybrid matching for a candidate against all open jobs.
 * Called automatically after a resume is uploaded.
 *
 * @param {string}   userId          - candidate's Supabase auth user ID
 * @param {number[]} resumeEmbedding - 384-dim float array (just generated)
 */
export async function runSemanticMatchingForCandidate(userId, resumeEmbedding) {
  console.log('[SemanticMatching] Starting for candidate:', userId)

  try {
    // ── 1. Vector search: find top 20 semantically similar jobs ──────────────
    const vectorResults = await findMatchingJobsForCandidate(resumeEmbedding, 20)
    if (!vectorResults.length) {
      console.log('[SemanticMatching] No vector results — likely no job embeddings yet.')
      return
    }

    const jobIds = vectorResults.map(r => r.job_id)
    const similarityMap = {}
    vectorResults.forEach(r => { similarityMap[r.job_id] = r.similarity })

    // ── 2. Fetch job details, candidate profile, and latest resume (for ATS score) ────────
    const [
      { data: jobs },
      { data: candidateProfile },
      { data: resumeRow }
    ] = await Promise.all([
      supabase.from('jobs').select('*').in('id', jobIds).eq('status', 'open'),
      supabase.from('candidate_profiles').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('resumes').select('resume_score').eq('applicant_id', userId).maybeSingle()
    ])

    if (!jobs?.length) {
      console.log('[SemanticMatching] Job details not found.')
      return
    }

    // Safely parse candidate skills (handles objects or string list)
    let candidateSkillsRaw = []
    if (candidateProfile?.skills) {
      try {
        candidateSkillsRaw = JSON.parse(candidateProfile.skills)
        if (!Array.isArray(candidateSkillsRaw)) candidateSkillsRaw = [candidateProfile.skills]
      } catch {
        candidateSkillsRaw = (candidateProfile.skills || '').split(',').map(s => s.trim())
      }
    }

    // Retrieve ATS score from latest resume
    const atsScore = resumeRow?.resume_score ?? 80; // Fallback to 80 if resume record has no score

    // Load matching weights from dynamic config
    const config = SEMANTIC_MATCHING_CONFIG;
    const w = config.weights;

    // ── 3. Build hybrid scores using config weights ──────────────────────────
    const upserts = jobs.map(job => {
      const semanticScore  = similarityMap[job.id] ?? 0           // 0–1
      const jobSkills      = parseSkills(job.required_skills)
      
      const { pct: skillPct, matched, missing } = getRuleBasedSkillScore(
        candidateSkillsRaw, 
        jobSkills, 
        config
      )

      // Calculate final ranking match_score based on config weights
      const hybridScore = Math.round(
        (semanticScore * 100 * w.semantic) + 
        (skillPct * w.skills) + 
        (atsScore * w.ats)
      )

      const recommendation = generateMatchRecommendation(
        hybridScore, matched, missing, job.title
      )

      return {
        user_id:        userId,
        job_id:         job.id,
        match_score:    hybridScore,
        semantic_score: Math.round(semanticScore * 100),
        skills_score:   Math.round(skillPct),
        match_status:   'Recommended',
        matching_skills: matched,
        missing_skills:  missing,
        strengths:       matched,
        recommendations: recommendation,
        match_reason:    recommendation,
        match_type:      'semantic',
        updated_at:      new Date().toISOString(),
      }
    })

    // ── 4. Upsert results ─────────────────────────────────────────────────────
    const { error } = await supabase
      .from('job_matches')
      .upsert(upserts, { onConflict: 'user_id,job_id' })

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
  }
}

/**
 * Fetch semantic match results for the candidate's AI Matches page.
 * Returns jobs sorted by semantic_score descending.
 *
 * @param {string} userId
 * @returns {Promise<object[]>}
 */
export async function fetchSemanticMatchesForCandidate(userId) {
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

  return (data || [])
    .filter(m => m.jobs?.status === 'open')
    .map((m, idx) => ({
      ...m.jobs,
      rank:            idx + 1,
      matchScore:      m.match_score      ?? 0,
      semanticScore:   m.semantic_score   ?? 0,
      skillsScore:     m.skills_score     ?? 0,
      matchedSkills:   Array.isArray(m.matching_skills) ? m.matching_skills : (m.matching_skills ? JSON.parse(m.matching_skills) : []),
      missingSkills:   Array.isArray(m.missing_skills)  ? m.missing_skills  : (m.missing_skills  ? JSON.parse(m.missing_skills)  : []),
      strengths:       Array.isArray(m.strengths)        ? m.strengths       : (m.strengths        ? JSON.parse(m.strengths)        : []),
      recommendations: m.recommendations ?? '',
      matchReason:     m.match_reason     ?? '',
    }))
}
