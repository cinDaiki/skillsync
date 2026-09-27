import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAuthoritativeJobMatchBreakdown,
  recalculateAuthoritativeMatch
} from "../../services/applicationService";
import {
  getMicrocredentialsCatalog,
  matchMicrocredentialsForMissingSkills
} from "../../services/microcredentialService";

function formatSkillTitle(skill) {
  if (!skill || typeof skill !== 'string') return '';
  const trimmed = skill.trim();
  const upper = trimmed.toUpperCase();
  const knownAcronyms = ['AWS', 'CRM', 'SQL', 'HTML', 'CSS', 'JS', 'TS', 'PHP', 'API', 'REST', 'RESTFUL', 'POS', 'UI', 'UX', 'CI', 'CD', 'CI/CD', 'CKAD', 'PMP', 'CCNA', 'BPO', 'AI', 'ML'];
  if (knownAcronyms.includes(upper)) return upper;
  return trimmed
    .split(/\s+/)
    .map(word => {
      const wUpper = word.toUpperCase();
      if (knownAcronyms.includes(wUpper)) return wUpper;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

export default function ImproveMatchModal({
  isOpen,
  onClose,
  job,
  eligibility: initialEligibility,
  onEligibilityUpdate
}) {
  const navigate = useNavigate();
  const [eligibility, setEligibility] = useState(initialEligibility);
  const [breakdown, setBreakdown] = useState(null);
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [microcredentials, setMicrocredentials] = useState([]);
  const [recalculateFeedback, setRecalculateFeedback] = useState(null);

  useEffect(() => {
    setEligibility(initialEligibility);
  }, [initialEligibility]);

  useEffect(() => {
    if (!isOpen || !job?.id) return;
    loadBreakdownAndRecommendations();
  }, [isOpen, job?.id]);

  async function loadBreakdownAndRecommendations() {
    setLoadingBreakdown(true);
    setRecalculateFeedback(null);
    try {
      const res = await getAuthoritativeJobMatchBreakdown(job.id);
      if (res && !res.error) {
        setBreakdown(res.breakdown);
        if (res.missingSkills?.length > 0) {
          const catalog = await getMicrocredentialsCatalog();
          const recs = matchMicrocredentialsForMissingSkills(res.missingSkills, catalog);
          setMicrocredentials(recs || []);
        } else {
          setMicrocredentials([]);
        }
      }
    } catch (err) {
      console.warn("[ImproveMatchModal] Error loading breakdown:", err);
    } finally {
      setLoadingBreakdown(false);
    }
  }

  async function handleRecalculate() {
    if (!job?.id || recalculating) return;
    setRecalculating(true);
    setRecalculateFeedback(null);
    try {
      const result = await recalculateAuthoritativeMatch(job.id);
      if (result.success) {
        setEligibility(result.eligibility);
        setBreakdown(result.breakdown);
        if (onEligibilityUpdate) {
          onEligibilityUpdate(result.eligibility);
        }

        const missing = result.eligibility?.missingSkills || [];
        if (missing.length > 0) {
          const catalog = await getMicrocredentialsCatalog();
          const recs = matchMicrocredentialsForMissingSkills(missing, catalog);
          setMicrocredentials(recs || []);
        } else {
          setMicrocredentials([]);
        }

        const newScore = result.matchScore;
        const reqScore = result.eligibility?.requiredMatch ?? 70;
        if (newScore >= reqScore) {
          setRecalculateFeedback({
            type: "success",
            message: `🎉 Match recalculated to ${newScore}%! You now meet the ${reqScore}% requirement. "Apply Now" is unlocked!`
          });
        } else {
          const diff = reqScore - newScore;
          setRecalculateFeedback({
            type: "info",
            message: `Updated match score: ${newScore}%. You need ${diff} percentage point${diff === 1 ? "" : "s"} more to apply.`
          });
        }
      } else {
        setRecalculateFeedback({
          type: "error",
          message: "Could not recalculate match at this time. Please try again."
        });
      }
    } catch (err) {
      setRecalculateFeedback({
        type: "error",
        message: err.message || "Recalculation failed."
      });
    } finally {
      setRecalculating(false);
    }
  }

  if (!isOpen || !job) return null;

  const matchScore = eligibility?.matchScore ?? 0;
  const requiredMatch = eligibility?.requiredMatch ?? job.minimum_match_percentage ?? 70;
  const gap = Math.max(0, requiredMatch - matchScore);
  const isEligible = matchScore >= requiredMatch;
  const matchingSkills = eligibility?.matchingSkills || [];
  const missingSkills = eligibility?.missingSkills || [];

  // Identify weaker factors
  const weakerFactors = [];
  if (breakdown) {
    if ((breakdown.credentialsScore ?? 100) < 80) {
      weakerFactors.push({
        name: "Credentials & Certifications",
        score: breakdown.credentialsScore ?? 0,
        weight: "10%",
        advice: "Upload verified industry certificates or complete microcredentials to boost this factor."
      });
    }
    if ((breakdown.semanticRelevance ?? 100) < 60) {
      weakerFactors.push({
        name: "Semantic Relevance",
        score: breakdown.semanticRelevance ?? 0,
        weight: "10%",
        advice: "Update or reprocess your resume so SkillSync can evaluate its relevance more completely."
      });
    }
    if ((breakdown.experienceCompatibility ?? 100) < 80) {
      weakerFactors.push({
        name: "Experience Compatibility",
        score: breakdown.experienceCompatibility ?? 0,
        weight: "15%",
        advice: "Ensure your profile reflects your complete, accurate work history and years of experience."
      });
    }
    if ((breakdown.educationCompatibility ?? 100) < 80) {
      weakerFactors.push({
        name: "Education Compatibility",
        score: breakdown.educationCompatibility ?? 0,
        weight: "15%",
        advice: "Confirm your highest level of education and degree are fully specified on your profile."
      });
    }
    if ((breakdown.requiredSkillsScore ?? 100) < 80) {
      weakerFactors.push({
        name: "Required Skills",
        score: breakdown.requiredSkillsScore ?? 0,
        weight: "35%",
        advice: "Add any required skills you possess to your profile or acquire them via microcredentials."
      });
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(15, 23, 42, 0.75)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "16px"
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "#ffffff",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "760px",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          display: "flex",
          flexDirection: "column",
          fontFamily: "inherit"
        }}
      >
        {/* ── Modal Header ── */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            background: "#f8fafc",
            borderTopLeftRadius: "16px",
            borderTopRightRadius: "16px"
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <span style={{ fontSize: "18px" }}>🎯</span>
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "800", color: "#1e1b4b" }}>
                Improve Your Match
              </h3>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: "700",
                  background: "#ede9fe",
                  color: "#6d28d9",
                  padding: "3px 8px",
                  borderRadius: "12px"
                }}
              >
                Authoritative Guidance
              </span>
            </div>
            <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
              <strong>{job.title}</strong> · {job.company_name || job.employer_name || "Hiring Employer"}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "#f1f5f9",
              border: "none",
              fontSize: "18px",
              fontWeight: "700",
              color: "#64748b",
              cursor: "pointer",
              borderRadius: "50%",
              width: "32px",
              height: "32px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.15s"
            }}
            title="Close modal"
          >
            ✕
          </button>
        </div>

        {/* ── Modal Body ── */}
        <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
          
          {/* STEP 7: Blocked State / Status Hero */}
          {!isEligible ? (
            <div
              style={{
                background: "#fff1f2",
                border: "1px solid #fecdd3",
                borderRadius: "12px",
                padding: "18px 20px"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <span style={{ fontSize: "18px" }}>⚠️</span>
                <strong style={{ fontSize: "15px", color: "#be123c" }}>
                  You don't currently meet this employer's minimum match requirement.
                </strong>
              </div>
              <p style={{ margin: "0 0 12px 0", fontSize: "13px", color: "#9f1239", lineHeight: "1.5" }}>
                This employer has configured a minimum threshold of <strong>{requiredMatch}%</strong> compatibility.
                Review the factor breakdown below to see what you need to improve before applying.
              </p>
              
              {/* Metrics Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "12px",
                  background: "#ffffff",
                  padding: "12px 16px",
                  borderRadius: "10px",
                  border: "1px solid #fed7aa"
                }}
              >
                <div>
                  <div style={{ fontSize: "11px", color: "#64748b", fontWeight: "600" }}>Your Match</div>
                  <div style={{ fontSize: "20px", fontWeight: "800", color: "#e11d48" }}>{matchScore}%</div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "#64748b", fontWeight: "600" }}>Required Match</div>
                  <div style={{ fontSize: "20px", fontWeight: "800", color: "#1e293b" }}>{requiredMatch}%</div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", color: "#64748b", fontWeight: "600" }}>Difference</div>
                  <div style={{ fontSize: "18px", fontWeight: "800", color: "#ea580c" }}>
                    {gap} percentage point{gap === 1 ? "" : "s"} needed
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                background: "#f0fdf4",
                border: "1px solid #bbf7d0",
                borderRadius: "12px",
                padding: "16px 20px"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "18px" }}>🎉</span>
                <strong style={{ fontSize: "15px", color: "#166534" }}>
                  Requirement Met! Your match score ({matchScore}%) satisfies this employer's requirement ({requiredMatch}%).
                </strong>
              </div>
              <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#15803d" }}>
                You are fully eligible to submit your application for this position.
              </p>
            </div>
          )}

          {/* Feedback banner from recalculation */}
          {recalculateFeedback && (
            <div
              style={{
                padding: "12px 16px",
                borderRadius: "8px",
                fontSize: "13px",
                fontWeight: "600",
                background:
                  recalculateFeedback.type === "success"
                    ? "#f0fdf4"
                    : recalculateFeedback.type === "error"
                    ? "#fff1f2"
                    : "#eff6ff",
                color:
                  recalculateFeedback.type === "success"
                    ? "#166534"
                    : recalculateFeedback.type === "error"
                    ? "#9f1239"
                    : "#1e40af",
                border: `1px solid ${
                  recalculateFeedback.type === "success"
                    ? "#bbf7d0"
                    : recalculateFeedback.type === "error"
                    ? "#fecdd3"
                    : "#bfdbfe"
                }`
              }}
            >
              {recalculateFeedback.message}
            </div>
          )}

          {/* STEP 9: 6-Factor Authoritative Component Scores */}
          <div style={{ background: "#f8fafc", padding: "18px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <h4 style={{ margin: 0, fontSize: "14px", fontWeight: "800", color: "#1e1b4b" }}>
                📊 Unified 6-Factor Authoritative Match Breakdown
              </h4>
              <span style={{ fontSize: "11px", color: "#64748b" }}>Authoritative Server Engine</span>
            </div>

            {loadingBreakdown ? (
              <div style={{ padding: "20px", textAlign: "center", color: "#64748b", fontSize: "13px" }}>
                Loading authoritative factor breakdown...
              </div>
            ) : breakdown ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                {/* 1. Required Skills */}
                <div style={{ background: "#ffffff", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "6px" }}>
                    <span style={{ fontWeight: "700", color: "#334155" }}>🎯 Required Skills (35%)</span>
                    <strong style={{ color: breakdown.requiredSkillsScore >= 80 ? "#166534" : "#ea580c" }}>
                      {breakdown.requiredSkillsScore}%
                    </strong>
                  </div>
                  <div style={{ height: "6px", background: "#e2e8f0", borderRadius: "4px", overflow: "hidden" }}>
                    <div style={{ width: `${breakdown.requiredSkillsScore}%`, height: "100%", background: "#6366f1" }} />
                  </div>
                </div>

                {/* 2. Transferable Skills */}
                <div style={{ background: "#ffffff", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "6px" }}>
                    <span style={{ fontWeight: "700", color: "#334155" }}>🔄 Transferable Skills (15%)</span>
                    <strong style={{ color: breakdown.transferableSkillsScore >= 80 ? "#166534" : "#ea580c" }}>
                      {breakdown.transferableSkillsScore}%
                    </strong>
                  </div>
                  <div style={{ height: "6px", background: "#e2e8f0", borderRadius: "4px", overflow: "hidden" }}>
                    <div style={{ width: `${breakdown.transferableSkillsScore}%`, height: "100%", background: "#8b5cf6" }} />
                  </div>
                </div>

                {/* 3. Education Compatibility */}
                <div style={{ background: "#ffffff", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "6px" }}>
                    <span style={{ fontWeight: "700", color: "#334155" }}>🎓 Education (15%)</span>
                    <strong style={{ color: breakdown.educationCompatibility >= 80 ? "#166534" : "#ea580c" }}>
                      {breakdown.educationCompatibility}%
                    </strong>
                  </div>
                  <div style={{ height: "6px", background: "#e2e8f0", borderRadius: "4px", overflow: "hidden" }}>
                    <div style={{ width: `${breakdown.educationCompatibility}%`, height: "100%", background: "#3b82f6" }} />
                  </div>
                </div>

                {/* 4. Experience Compatibility */}
                <div style={{ background: "#ffffff", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "6px" }}>
                    <span style={{ fontWeight: "700", color: "#334155" }}>💼 Experience (15%)</span>
                    <strong style={{ color: breakdown.experienceCompatibility >= 80 ? "#166534" : "#ea580c" }}>
                      {breakdown.experienceCompatibility}%
                    </strong>
                  </div>
                  <div style={{ height: "6px", background: "#e2e8f0", borderRadius: "4px", overflow: "hidden" }}>
                    <div style={{ width: `${breakdown.experienceCompatibility}%`, height: "100%", background: "#06b6d4" }} />
                  </div>
                </div>

                {/* 5. Semantic Relevance */}
                <div style={{ background: "#ffffff", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "6px" }}>
                    <span style={{ fontWeight: "700", color: "#334155" }}>🤖 Semantic Relevance (10%)</span>
                    <strong style={{ color: breakdown.semanticRelevance >= 60 ? "#166534" : "#be123c" }}>
                      {breakdown.semanticRelevance}%
                    </strong>
                  </div>
                  <div style={{ height: "6px", background: "#e2e8f0", borderRadius: "4px", overflow: "hidden" }}>
                    <div style={{ width: `${breakdown.semanticRelevance}%`, height: "100%", background: "#ec4899" }} />
                  </div>
                </div>

                {/* 6. Credentials / Certifications */}
                <div style={{ background: "#ffffff", padding: "12px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", marginBottom: "6px" }}>
                    <span style={{ fontWeight: "700", color: "#334155" }}>📜 Credentials & Badges (10%)</span>
                    <strong style={{ color: breakdown.credentialsScore >= 80 ? "#166534" : "#ea580c" }}>
                      {breakdown.credentialsScore}%
                    </strong>
                  </div>
                  <div style={{ height: "6px", background: "#e2e8f0", borderRadius: "4px", overflow: "hidden" }}>
                    <div style={{ width: `${breakdown.credentialsScore}%`, height: "100%", background: "#10b981" }} />
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* STEP 10 & STEP 11: Skills Evaluation & Missing vs No-Missing Skills Handling */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {/* Matched Skills */}
            <div>
              <div style={{ fontSize: "13px", fontWeight: "700", color: "#166534", marginBottom: "6px" }}>
                ✓ Matched Required Skills ({matchingSkills.length})
              </div>
              {matchingSkills.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {matchingSkills.map((s, idx) => (
                    <span
                      key={idx}
                      style={{
                        background: "#dcfce7",
                        color: "#166534",
                        fontSize: "12px",
                        fontWeight: "600",
                        padding: "3px 10px",
                        borderRadius: "14px",
                        border: "1px solid #bbf7d0"
                      }}
                    >
                      ✓ {formatSkillTitle(s)}
                    </span>
                  ))}
                </div>
              ) : (
                <span style={{ fontSize: "12px", color: "#64748b" }}>No required skills matched yet.</span>
              )}
            </div>

            {/* Missing Skills Case (Step 10) vs No Missing Skills Case (Step 11) */}
            {missingSkills.length > 0 ? (
              <div style={{ marginTop: "6px" }}>
                <div style={{ fontSize: "13px", fontWeight: "700", color: "#be123c", marginBottom: "6px" }}>
                  ⚠️ Missing Required Skills ({missingSkills.length})
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px" }}>
                  {missingSkills.map((s, idx) => (
                    <span
                      key={idx}
                      style={{
                        background: "#ffe4e6",
                        color: "#9f1239",
                        fontSize: "12px",
                        fontWeight: "600",
                        padding: "3px 10px",
                        borderRadius: "14px",
                        border: "1px solid #fecdd3"
                      }}
                    >
                      ⚠ {formatSkillTitle(s)}
                    </span>
                  ))}
                </div>

                {/* Recommended Microcredentials for missing skills */}
                {microcredentials.length > 0 && (
                  <div style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", padding: "14px", borderRadius: "10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <strong style={{ fontSize: "13px", color: "#4c1d95" }}>
                        🎓 Recommended Microcredentials to Close Skill Gaps
                      </strong>
                      <span style={{ fontSize: "11px", color: "#6d28d9", fontWeight: "600" }}>
                        {microcredentials.length} Program{microcredentials.length > 1 ? "s" : ""} Available
                      </span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {microcredentials.slice(0, 3).map((mc, idx) => (
                        <div
                          key={idx}
                          style={{
                            background: "#ffffff",
                            padding: "10px 12px",
                            borderRadius: "8px",
                            border: "1px solid #e2e8f0",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center"
                          }}
                        >
                          <div>
                            <span style={{ fontSize: "10px", fontWeight: "700", background: "#ede9fe", color: "#6d28d9", padding: "2px 6px", borderRadius: "4px", marginRight: "6px" }}>
                              {mc.provider}
                            </span>
                            <strong style={{ fontSize: "12px", color: "#1e293b" }}>{mc.title}</strong>
                            <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                              Helps acquire: {mc.coveredSkills?.map(formatSkillTitle).join(", ") || formatSkillTitle(mc.skill_name)}
                            </div>
                          </div>
                          {mc.url && mc.url.startsWith("http") && (
                            <a
                              href={mc.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                fontSize: "11px",
                                fontWeight: "700",
                                color: "#6f1dce",
                                textDecoration: "none",
                                padding: "4px 8px",
                                background: "#f3e8ff",
                                borderRadius: "6px"
                              }}
                            >
                              View ↗
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* STEP 11: NO MISSING SKILLS CASE */
              <div
                style={{
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  padding: "14px 16px",
                  borderRadius: "10px"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                  <span style={{ color: "#166534", fontWeight: "800", fontSize: "14px" }}>
                    ✓ All Required Skills Matched
                  </span>
                </div>
                {!isEligible && (
                  <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#15803d", lineHeight: "1.5" }}>
                    <strong>Your required skills are complete, but other match factors are lowering your overall score.</strong>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* STEP 12 & STEP 13: Recommended Actions Based on Weaker Factors */}
          {!isEligible && weakerFactors.length > 0 && (
            <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
              <h4 style={{ margin: "0 0 10px 0", fontSize: "14px", fontWeight: "800", color: "#1e1b4b" }}>
                💡 Actionable Recommendations to Reach {requiredMatch}%
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {weakerFactors.map((wf, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: "#ffffff",
                      padding: "12px 14px",
                      borderRadius: "8px",
                      border: "1px solid #e2e8f0",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "12px"
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: "700", color: "#0f172a" }}>
                        {wf.name} (Current: {wf.score}%)
                      </div>
                      <div style={{ fontSize: "12px", color: "#475569", marginTop: "2px" }}>
                        {wf.advice}
                      </div>
                    </div>
                    {wf.name.includes("Semantic") ? (
                      <button
                        onClick={() => {
                          onClose();
                          navigate("/candidate/resume");
                        }}
                        style={{
                          fontSize: "11px",
                          fontWeight: "700",
                          color: "#ffffff",
                          background: "#6f1dce",
                          border: "none",
                          padding: "6px 12px",
                          borderRadius: "6px",
                          cursor: "pointer",
                          whiteSpace: "nowrap"
                        }}
                      >
                        Update Resume →
                      </button>
                    ) : wf.name.includes("Credentials") ? (
                      <button
                        onClick={() => {
                          onClose();
                          navigate("/candidate/profile");
                        }}
                        style={{
                          fontSize: "11px",
                          fontWeight: "700",
                          color: "#ffffff",
                          background: "#0284c7",
                          border: "none",
                          padding: "6px 12px",
                          borderRadius: "6px",
                          cursor: "pointer",
                          whiteSpace: "nowrap"
                        }}
                      >
                        Add Certs →
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          onClose();
                          navigate("/candidate/profile");
                        }}
                        style={{
                          fontSize: "11px",
                          fontWeight: "700",
                          color: "#475569",
                          background: "#f1f5f9",
                          border: "1px solid #cbd5e1",
                          padding: "6px 12px",
                          borderRadius: "6px",
                          cursor: "pointer",
                          whiteSpace: "nowrap"
                        }}
                      >
                        Edit Profile →
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* ── Modal Footer ── */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid #e2e8f0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: "#f8fafc",
            borderBottomLeftRadius: "16px",
            borderBottomRightRadius: "16px"
          }}
        >
          {/* STEP 14: Server-Authoritative Recalculate Button */}
          <button
            onClick={handleRecalculate}
            disabled={recalculating}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 18px",
              background: recalculating ? "#94a3b8" : "#6f1dce",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: "700",
              cursor: recalculating ? "not-allowed" : "pointer",
              boxShadow: "0 1px 2px rgba(0,0,0,0.1)"
            }}
          >
            {recalculating ? (
              <>
                <span
                  style={{
                    width: "14px",
                    height: "14px",
                    border: "2px solid #ffffff",
                    borderTopColor: "transparent",
                    borderRadius: "50%",
                    display: "inline-block",
                    animation: "spin 1s linear infinite"
                  }}
                />
                Recalculating Match...
              </>
            ) : (
              <>
                <span>🔄</span>
                Recalculate Match
              </>
            )}
          </button>

          <button
            onClick={onClose}
            style={{
              padding: "10px 18px",
              background: "#ffffff",
              color: "#475569",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer"
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
