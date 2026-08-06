/**
 * semanticMatchingService.js
 *
 * Main orchestration layer for AI-powered semantic job matching.
 *
 * Hybrid scoring formula:
 *   Final Score = (Semantic Cosine Score × 0.70) + (Rule-Based Score × 0.30)
 *
 * This approach beats pure semantic: semantic catches meaning even when exact
 * keywords differ; rule-based catches exact skill names the model might miss.
 */

import { supabase }                  from '../supabase'
import { findMatchingJobsForCandidate } from './vectorSearchService'
import { generateMatchRecommendation }  from './recommendationService'
import { normalizeSkillName }           from '../normalization'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseSkills(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map(s => normalizeSkillName(s)).filter(Boolean)
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.map(s => normalizeSkillName(s)).filter(Boolean)
  } catch { /* ignore */ }
  return raw.split(',').map(s => normalizeSkillName(s)).filter(Boolean)
}

function getRuleBasedSkillScore(candidateSkills, jobSkills) {
  if (!jobSkills.length) return { pct: 100, matched: [], missing: [] }
  const matched = []
  const missing = []
  jobSkills.forEach(req => {
    const hit = candidateSkills.some(c => c.includes(req) || req.includes(c))
    hit ? matched.push(req) : missing.push(req)
  })
  return { pct: (matched.length / jobSkills.length) * 100, matched, missing }
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

    // ── 2. Fetch job details + candidate profile ──────────────────────────────
    const [{ data: jobs }, { data: candidateProfile }] = await Promise.all([
      supabase.from('jobs').select('*').in('id', jobIds).eq('status', 'open'),
      supabase.from('candidate_profiles').select('*').eq('user_id', userId).maybeSingle(),
    ])

    if (!jobs?.length) {
      console.log('[SemanticMatching] Job details not found.')
      return
    }

    const candidateSkills = parseSkills(candidateProfile?.skills)

    // ── 3. Build hybrid scores ────────────────────────────────────────────────
    const upserts = jobs.map(job => {
      const semanticScore  = similarityMap[job.id] ?? 0           // 0–1
      const jobSkills      = parseSkills(job.required_skills)
      const { pct: skillPct, matched, missing } = getRuleBasedSkillScore(candidateSkills, jobSkills)

      // Rule-based sub-score (skills only, 0–100)
      const ruleScore = skillPct

      // Hybrid: semantic 70% + rule-based 30%
      const hybridScore = Math.round(
        (semanticScore * 100 * 0.70) + (ruleScore * 0.30)
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
