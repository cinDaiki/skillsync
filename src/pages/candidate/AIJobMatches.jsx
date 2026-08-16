/**
 * AIJobMatches.jsx  —  Route: /candidate/ai-matches
 *
 * Candidate-facing page that displays AI-powered semantic job matches.
 * Shows a ranked list of open jobs with semantic scores and allows the
 * candidate to view a full AI Match Report and apply directly.
 */

import { useEffect, useState, useCallback } from 'react'
import DashboardLayout                       from '../../components/layout/DashboardLayout'
import AIMatchReport                         from '../../components/ai/AIMatchReport'
import { supabase }                          from '../../services/supabase'
import { applyForJobWithSnapshot }           from '../../services/applicationService'
import { triggerSimulationNotification }     from '../../services/notificationService'
import { fetchSemanticMatchesForCandidate }  from '../../services/ai/semanticMatchingService'
import { getMatchTier }                      from '../../services/ai/recommendationService'
import { useToast }                          from '../../contexts/ToastContext'
import './AIJobMatches.css'

// ─── Helper ───────────────────────────────────────────────────────────────────

function MatchScoreBadge({ score }) {
  const tier = getMatchTier(score)
  return (
    <span
      className="ai-jobs-score-badge"
      style={{ color: tier.color, background: tier.bg }}
    >
      {score}%
    </span>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AIJobMatches() {
  const toast = useToast()

  const [userId,       setUserId]       = useState(null)
  const [matches,      setMatches]      = useState([])
  const [applications, setApplications] = useState([])
  const [loading,      setLoading]      = useState(true)
  const [hasResume,    setHasResume]    = useState(false)
  const [hasEmbedding, setHasEmbedding] = useState(false)
  const [applying,     setApplying]     = useState(null)  // job_id being applied to
  const [verificationStatus, setVerificationStatus] = useState("Pending Verification")

  // Filter / search
  const [search,       setSearch]       = useState('')
  const [minScore,     setMinScore]     = useState(0)

  // AI Report modal
  const [reportJob,    setReportJob]    = useState(null)
  const [profile,      setProfile]      = useState(null)

  // ── Load data ───────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    setUserId(user.id)

    // Load user profile verification status
    const { data: profRow } = await supabase
      .from('profiles')
      .select('verification_status')
      .eq('id', user.id)
      .maybeSingle()
    setVerificationStatus(profRow?.verification_status || 'Pending Verification')

    // Check resume + embedding existence
    const { data: resumeRow } = await supabase
      .from('resumes')
      .select('id, resume_embedding')
      .eq('applicant_id', user.id)
      .maybeSingle()

    setHasResume(!!resumeRow)
    setHasEmbedding(!!(resumeRow?.resume_embedding))

    // Load candidate profile for education/experience display
    const { data: prof } = await supabase
      .from('candidate_profiles')
      .select('degree, course, years_experience')
      .eq('user_id', user.id)
      .maybeSingle()
    setProfile(prof)

    // Load existing applications (to mark applied jobs)
    const { data: apps } = await supabase
      .from('applications')
      .select('job_id')
      .eq('applicant_id', user.id)
    setApplications((apps || []).map(a => a.job_id))

    // Load semantic matches
    const semanticMatches = await fetchSemanticMatchesForCandidate(user.id)
    setMatches(semanticMatches)

    setLoading(false)
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Apply ───────────────────────────────────────────────────────────────────
  async function handleApply(job) {
    if (!userId || applying) return
    if (verificationStatus !== "Verified" && verificationStatus !== "Approved") {
      if (verificationStatus === "Under Review") {
        toast.error("Your verification is under review. You can apply once the admin approves your identity.")
      } else {
        toast.error("Your identity must be verified before applying to jobs. Please complete ID verification in your Profile.")
      }
      return
    }
    setApplying(job.id)
    try {
      const { error } = await applyForJobWithSnapshot(job.id, userId)
      if (error) {
        toast.error(error.message || 'Failed to apply.')
        return
      }
      setApplications(prev => [...prev, job.id])
      toast.success(`Applied to "${job.title}" successfully!`)
      await triggerSimulationNotification(userId, 'job_applied', { jobTitle: job.title })
      setReportJob(null)
    } catch (err) {
      toast.error('Unexpected error applying.')
    } finally {
      setApplying(null)
    }
  }

  // ── Filtered matches ────────────────────────────────────────────────────────
  const filtered = matches.filter(j => {
    const q = search.toLowerCase()
    const titleMatch    = j.title?.toLowerCase().includes(q)
    const companyMatch  = j.company_name?.toLowerCase().includes(q)
    const locationMatch = j.location?.toLowerCase().includes(q)
    return (titleMatch || companyMatch || locationMatch) && j.matchScore >= minScore
  })

  // ── States ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <DashboardLayout>
        <div className="ai-jobs-loading">
          <div className="ai-jobs-spinner" />
          <p>Loading AI matches…</p>
        </div>
      </DashboardLayout>
    )
  }

  if (!hasResume) {
    return (
      <DashboardLayout>
        <div className="ai-jobs-empty-state">
          <span className="ai-jobs-empty-icon">📄</span>
          <h2>No Resume Uploaded</h2>
          <p>Upload your resume first to enable AI-powered job matching.</p>
          <a href="/candidate/resume" className="ai-jobs-cta-btn">Upload Resume →</a>
        </div>
      </DashboardLayout>
    )
  }

  if (!hasEmbedding) {
    return (
      <DashboardLayout>
        <div className="ai-jobs-empty-state">
          <span className="ai-jobs-empty-icon">🤖</span>
          <h2>AI Analysis Not Yet Generated</h2>
          <p>
            Upload a new resume to trigger the AI semantic embedding and matching engine.
            Existing resumes uploaded before this feature was enabled do not have embeddings yet.
          </p>
          <a href="/candidate/resume" className="ai-jobs-cta-btn">Re-upload Resume →</a>
        </div>
      </DashboardLayout>
    )
  }

  if (matches.length === 0) {
    return (
      <DashboardLayout>
        <div className="ai-jobs-empty-state">
          <span className="ai-jobs-empty-icon">🔍</span>
          <h2>No AI Matches Yet</h2>
          <p>The AI matching engine hasn't found any open jobs for your profile yet. Check back soon as employers post new positions.</p>
        </div>
      </DashboardLayout>
    )
  }

  // ── Main Render ─────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <section className="ai-jobs-page">

        {/* Page Header */}
        <div className="ai-jobs-page-header">
          <div>
            <h1 className="ai-jobs-page-title">
              🤖 AI Job Matches
            </h1>
            <p className="ai-jobs-page-subtitle">
              Ranked by semantic similarity using <strong>all-MiniLM-L6-v2</strong> — {matches.length} matches found
            </p>
          </div>
          <div className="ai-jobs-stats-row">
            <div className="ai-jobs-stat">
              <strong>{matches.filter(m => m.matchScore >= 80).length}</strong>
              <span>High Matches</span>
            </div>
            <div className="ai-jobs-stat">
              <strong>{matches[0]?.matchScore ?? 0}%</strong>
              <span>Best Score</span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="ai-jobs-filters">
          <input
            type="text"
            className="ai-jobs-search"
            placeholder="Search job title, company, or location…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            className="ai-jobs-filter-select"
            value={minScore}
            onChange={e => setMinScore(Number(e.target.value))}
          >
            <option value={0}>All Scores</option>
            <option value={80}>80%+ (High Match)</option>
            <option value={65}>65%+ (Good Match)</option>
            <option value={50}>50%+ (Partial Match)</option>
          </select>
        </div>

        {/* Results count */}
        <p className="ai-jobs-results-count">
          Showing {filtered.length} of {matches.length} matches
        </p>

        {/* Match Cards */}
        <div className="ai-jobs-list">
          {filtered.map((job, idx) => {
            const tier    = getMatchTier(job.matchScore)
            const applied = applications.includes(job.id)
            return (
              <div key={job.id} className="ai-job-card">
                <div className="ai-job-card-rank">#{idx + 1}</div>

                <div className="ai-job-card-body">
                  <div className="ai-job-card-top">
                    <div>
                      <h3 className="ai-job-card-title">{job.title}</h3>
                      <p className="ai-job-card-meta">
                        {[job.company_name, job.location, job.employment_type, job.work_setup]
                          .filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <MatchScoreBadge score={job.matchScore} />
                  </div>

                  {/* Skill previews */}
                  {job.matchedSkills?.length > 0 && (
                    <div className="ai-job-card-skills">
                      {job.matchedSkills.slice(0, 5).map(s => (
                        <span key={s} className="ai-job-skill-tag matched">✓ {s}</span>
                      ))}
                      {job.missingSkills?.slice(0, 2).map(s => (
                        <span key={s} className="ai-job-skill-tag missing">✗ {s}</span>
                      ))}
                    </div>
                  )}

                  <div className="ai-job-card-footer">
                    <div className="ai-job-mini-scores">
                      <span>Semantic: <strong>{job.semanticScore}%</strong></span>
                      <span>Skills: <strong>{job.skillsScore}%</strong></span>
                    </div>
                    <div className="ai-job-card-actions">
                      <button
                        className="ai-job-btn-report"
                        onClick={() => setReportJob(job)}
                      >
                        View AI Report
                      </button>
                      <button
                        className="ai-job-btn-apply"
                        disabled={applied || applying === job.id}
                        onClick={() => handleApply(job)}
                      >
                        {applied ? '✓ Applied' : applying === job.id ? 'Applying…' : 'Apply'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

      </section>

      {/* AI Match Report Modal */}
      {reportJob && (
        <AIMatchReport
          job={reportJob}
          matchScore={reportJob.matchScore}
          semanticScore={reportJob.semanticScore}
          matchedSkills={reportJob.matchedSkills}
          missingSkills={reportJob.missingSkills}
          recommendation={reportJob.recommendations || reportJob.matchReason}
          educationMatch={profile?.degree || profile?.course || ''}
          experienceYrs={profile?.years_experience || 0}
          onClose={() => setReportJob(null)}
          onApply={() => handleApply(reportJob)}
          applied={applications.includes(reportJob.id)}
          mode="candidate"
        />
      )}
    </DashboardLayout>
  )
}
