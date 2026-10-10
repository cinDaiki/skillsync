import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAuthoritativeJobMatchBreakdown,
  recalculateAuthoritativeMatch
} from "../../services/applicationService";
import {
  getMicrocredentialsCatalog,
  matchMicrocredentialsForMissingSkills
} from "../../services/microcredentialService";

const CANONICAL_SKILL_LABELS = {
  nodejs: "Node.js",
  "node.js": "Node.js",
  node: "Node.js",
  typescript: "TypeScript",
  javascript: "JavaScript",
  reactjs: "React",
  "react.js": "React",
  react: "React",
  postgresql: "PostgreSQL",
  postgres: "PostgreSQL",
  mongodb: "MongoDB",
  graphql: "GraphQL",
  mysql: "MySQL",
  dotnet: ".NET",
  ".net": ".NET",
  vuejs: "Vue.js",
  "vue.js": "Vue.js",
  nextjs: "Next.js",
  "next.js": "Next.js",
  angularjs: "AngularJS",
  "angular.js": "AngularJS",
  powerbi: "Power BI",
  "power bi": "Power BI",
  jquery: "jQuery",
  github: "GitHub",
  gitlab: "GitLab",
};

export function formatSkillTitle(skill) {
  if (!skill || typeof skill !== "string") return "";
  const trimmed = skill.trim();
  const lower = trimmed.toLowerCase();
  if (CANONICAL_SKILL_LABELS[lower]) {
    return CANONICAL_SKILL_LABELS[lower];
  }
  const upper = trimmed.toUpperCase();
  const knownAcronyms = [
    "AWS", "CRM", "SQL", "HTML", "CSS", "JS", "TS", "PHP", "API",
    "REST", "RESTFUL", "POS", "UI", "UX", "CI", "CD", "CI/CD",
    "CKAD", "PMP", "CCNA", "BPO", "AI", "ML", "GCP"
  ];
  if (knownAcronyms.includes(upper)) return upper;
  return trimmed
    .split(/\s+/)
    .map((word) => {
      const wUpper = word.toUpperCase();
      if (knownAcronyms.includes(wUpper)) return wUpper;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
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
  const [catalog, setCatalog] = useState([]);
  const [microcredentials, setMicrocredentials] = useState([]);
  const [recalculateFeedback, setRecalculateFeedback] = useState(null);
  const [showAllCatalog, setShowAllCatalog] = useState(false);

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
      const [breakdownRes, fullCatalog] = await Promise.all([
        getAuthoritativeJobMatchBreakdown(job.id),
        getMicrocredentialsCatalog()
      ]);

      if (Array.isArray(fullCatalog)) {
        setCatalog(fullCatalog);
      }

      if (breakdownRes && !breakdownRes.error) {
        setBreakdown(breakdownRes.breakdown);
        const missing = breakdownRes.missingSkills || [];
        if (missing.length > 0) {
          const recs = matchMicrocredentialsForMissingSkills(missing, fullCatalog);
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
          const cat = catalog.length > 0 ? catalog : await getMicrocredentialsCatalog();
          const recs = matchMicrocredentialsForMissingSkills(missing, cat);
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

  // Map each missing skill to its matching catalog items
  const missingSkillsWithRecs = useMemo(() => {
    const missing = eligibility?.missingSkills || [];
    return missing.map((skill) => {
      const formatted = formatSkillTitle(skill);
      const matches = microcredentials.filter((mc) => {
        const covered = Array.isArray(mc.coveredSkills) ? mc.coveredSkills : [mc.skill_name || ""];
        return covered.some((c) => c && c.toLowerCase().includes(skill.toLowerCase().trim()));
      });
      return {
        raw: skill,
        displayName: formatted,
        matches,
      };
    });
  }, [eligibility?.missingSkills, microcredentials]);

  if (!isOpen || !job) return null;

  const matchScore = eligibility?.matchScore ?? 0;
  const requiredMatch = eligibility?.requiredMatch ?? job.minimum_match_percentage ?? 70;
  const gap = Math.max(0, requiredMatch - matchScore);
  const isEligible = matchScore >= requiredMatch;
  const matchingSkills = eligibility?.matchingSkills || [];
  const missingSkills = eligibility?.missingSkills || [];

  const requiredSkillsScore = breakdown?.requiredSkillsScore ?? 0;
  const educationScore = breakdown?.educationCompatibility ?? 0;
  const experienceScore = breakdown?.experienceCompatibility ?? 0;

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
        padding: "16px",
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
          fontFamily: "inherit",
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
            borderTopRightRadius: "16px",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <span style={{ fontSize: "18px" }}>🎯</span>
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "800", color: "#1e1b4b" }}>
                Improve Your Match
              </h3>
            </div>
            <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
              <strong>{job.title}</strong> · {job.company_name || job.employer_name || "Hiring Employer"}
            </p>
          </div>
          <button
            type="button"
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
              transition: "all 0.15s",
            }}
            title="Close modal"
          >
            ✕
          </button>
        </div>

        {/* ── Modal Body ── */}
        <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "20px" }}>
          
          {/* Status Hero */}
          {!isEligible ? (
            <div
              style={{
                background: "#fff1f2",
                border: "1px solid #fecdd3",
                borderRadius: "12px",
                padding: "18px 20px",
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
                Review the key factors below to see what you need to improve before applying.
              </p>
              
              {/* Metrics Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                  gap: "12px",
                  background: "#ffffff",
                  padding: "12px 16px",
                  borderRadius: "10px",
                  border: "1px solid #fed7aa",
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
                padding: "16px 20px",
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
                }`,
              }}
            >
              {recalculateFeedback.message}
            </div>
          )}

          {/* ── STEP 7 & 8: Key Match Factors (3 Candidate-Facing Factors Only) ── */}
          <div style={{ background: "#f8fafc", padding: "18px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
            <div style={{ marginBottom: "14px" }}>
              <h4 style={{ margin: 0, fontSize: "15px", fontWeight: "800", color: "#1e1b4b" }}>
                📊 Key Match Factors
              </h4>
            </div>

            {loadingBreakdown ? (
              <div style={{ padding: "20px", textAlign: "center", color: "#64748b", fontSize: "13px" }}>
                Loading key match factors...
              </div>
            ) : breakdown ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "14px",
                }}
              >
                {/* 1. Required Skills */}
                <div style={{ background: "#ffffff", padding: "14px", borderRadius: "10px", border: "1px solid #cbd5e1" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", marginBottom: "8px" }}>
                    <span style={{ fontWeight: "700", color: "#334155" }}>🎯 Required Skills</span>
                    <strong style={{ fontSize: "15px", color: requiredSkillsScore >= 80 ? "#166534" : "#ea580c" }}>
                      {requiredSkillsScore}%
                    </strong>
                  </div>
                  <div style={{ height: "6px", background: "#e2e8f0", borderRadius: "4px", overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${Math.min(100, Math.max(0, requiredSkillsScore))}%`,
                        height: "100%",
                        background: requiredSkillsScore >= 80 ? "#10b981" : "#f59e0b",
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                </div>

                {/* 2. Education */}
                <div style={{ background: "#ffffff", padding: "14px", borderRadius: "10px", border: "1px solid #cbd5e1" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", marginBottom: "8px" }}>
                    <span style={{ fontWeight: "700", color: "#334155" }}>🎓 Education</span>
                    <strong style={{ fontSize: "15px", color: educationScore >= 80 ? "#166534" : "#ea580c" }}>
                      {educationScore}%
                    </strong>
                  </div>
                  <div style={{ height: "6px", background: "#e2e8f0", borderRadius: "4px", overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${Math.min(100, Math.max(0, educationScore))}%`,
                        height: "100%",
                        background: educationScore >= 80 ? "#10b981" : "#f59e0b",
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                </div>

                {/* 3. Experience */}
                <div style={{ background: "#ffffff", padding: "14px", borderRadius: "10px", border: "1px solid #cbd5e1" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", marginBottom: "8px" }}>
                    <span style={{ fontWeight: "700", color: "#334155" }}>💼 Experience</span>
                    <strong style={{ fontSize: "15px", color: experienceScore >= 80 ? "#166534" : "#ea580c" }}>
                      {experienceScore}%
                    </strong>
                  </div>
                  <div style={{ height: "6px", background: "#e2e8f0", borderRadius: "4px", overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${Math.min(100, Math.max(0, experienceScore))}%`,
                        height: "100%",
                        background: experienceScore >= 80 ? "#10b981" : "#f59e0b",
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* ── STEP 9: Matched & Missing Required Skills ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            {/* Matched Required Skills */}
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
                        border: "1px solid #bbf7d0",
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

            {/* Missing Required Skills */}
            {missingSkills.length > 0 ? (
              <div>
                <div style={{ fontSize: "13px", fontWeight: "700", color: "#be123c", marginBottom: "6px" }}>
                  ⚠️ Missing Required Skills ({missingSkills.length})
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
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
                        border: "1px solid #fecdd3",
                      }}
                    >
                      ⚠ {formatSkillTitle(s)}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              /* STEP 14: NO MISSING SKILLS CASE */
              <div
                style={{
                  background: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  padding: "12px 16px",
                  borderRadius: "10px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ color: "#166534", fontWeight: "800", fontSize: "13px" }}>
                    ✓ All Required Skills Matched
                  </span>
                </div>
                {!isEligible && (
                  <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#15803d", lineHeight: "1.4" }}>
                    Your required skills match this job. Other key factors like work history or experience are currently keeping your score below the threshold.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ── STEP 10 to 17: Recommended Actions ── */}
          <div style={{ background: "#f8fafc", padding: "18px", borderRadius: "12px", border: "1px solid #e2e8f0" }}>
            <h4 style={{ margin: "0 0 12px 0", fontSize: "15px", fontWeight: "800", color: "#1e1b4b" }}>
              💡 Recommended Actions
            </h4>

            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

              {/* ── STEP 11, 12, 13, 15: Recommended Microcredentials for Missing Skills ── */}
              {missingSkills.length > 0 && (
                <div
                  style={{
                    background: "#ffffff",
                    border: "1px solid #e0e7ff",
                    borderRadius: "10px",
                    padding: "16px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <strong style={{ fontSize: "14px", color: "#3730a3" }}>
                      🎓 Recommended Microcredentials
                    </strong>
                    <button
                      type="button"
                      onClick={() => setShowAllCatalog(!showAllCatalog)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#4f46e5",
                        fontSize: "12px",
                        fontWeight: "700",
                        cursor: "pointer",
                        textDecoration: "underline",
                        padding: 0,
                      }}
                    >
                      {showAllCatalog ? "Hide Full Catalog" : "Browse All Microcredentials →"}
                    </button>
                  </div>

                  {/* STEP 15: Safe compliant wording */}
                  <p style={{ margin: "0 0 14px 0", fontSize: "12px", color: "#475569", lineHeight: "1.5" }}>
                    These microcredentials can help you build skills relevant to this job. After improving your skills and updating your SkillSync profile, recalculate your match.
                  </p>

                  {/* Per-missing-skill recommendations */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {missingSkillsWithRecs.map((item, idx) => (
                      <div key={idx} style={{ borderTop: idx > 0 ? "1px dashed #e2e8f0" : "none", paddingTop: idx > 0 ? "12px" : 0 }}>
                        <div style={{ fontSize: "12px", fontWeight: "700", color: "#0f172a", marginBottom: "8px" }}>
                          Missing Skill: <span style={{ color: "#be123c" }}>{item.displayName}</span>
                        </div>

                        {item.matches.length > 0 ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            {item.matches.map((mc, mIdx) => (
                              <div
                                key={mIdx}
                                style={{
                                  background: "#f8fafc",
                                  border: "1px solid #e2e8f0",
                                  borderRadius: "8px",
                                  padding: "12px",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "flex-start",
                                  gap: "12px",
                                }}
                              >
                                <div style={{ flex: 1 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                                    <span
                                      style={{
                                        fontSize: "10px",
                                        fontWeight: "700",
                                        background: "#ede9fe",
                                        color: "#6d28d9",
                                        padding: "2px 6px",
                                        borderRadius: "4px",
                                      }}
                                    >
                                      {mc.provider}
                                    </span>
                                    {mc.duration && (
                                      <span style={{ fontSize: "11px", color: "#64748b" }}>
                                        · {mc.duration}
                                      </span>
                                    )}
                                    {mc.level && (
                                      <span style={{ fontSize: "11px", color: "#64748b" }}>
                                        · {mc.level}
                                      </span>
                                    )}
                                  </div>
                                  <strong style={{ fontSize: "13px", color: "#1e293b", display: "block" }}>
                                    {mc.title}
                                  </strong>
                                  {mc.description && (
                                    <p style={{ margin: "4px 0 6px 0", fontSize: "12px", color: "#475569", lineHeight: "1.4" }}>
                                      {mc.description}
                                    </p>
                                  )}
                                  <div style={{ fontSize: "11px", color: "#64748b" }}>
                                    Skills covered: {mc.coveredSkills?.map(formatSkillTitle).join(", ") || formatSkillTitle(mc.skill_name)}
                                  </div>
                                </div>

                                {/* STEP 12: CTA Button */}
                                {mc.url && (
                                  <a
                                    href={mc.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                      fontSize: "12px",
                                      fontWeight: "700",
                                      color: "#ffffff",
                                      background: "#4f46e5",
                                      textDecoration: "none",
                                      padding: "6px 12px",
                                      borderRadius: "6px",
                                      whiteSpace: "nowrap",
                                      flexShrink: 0,
                                      alignSelf: "center",
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: "4px",
                                    }}
                                  >
                                    View Microcredential ↗
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          /* STEP 13: NO MATCHING MICROCREDENTIAL CASE */
                          <div
                            style={{
                              background: "#f8fafc",
                              border: "1px solid #e2e8f0",
                              borderRadius: "8px",
                              padding: "10px 14px",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: "8px",
                            }}
                          >
                            <span style={{ fontSize: "12px", color: "#64748b" }}>
                              No specific microcredential is currently available for this skill.
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowAllCatalog(true)}
                              style={{
                                fontSize: "11px",
                                fontWeight: "700",
                                color: "#4f46e5",
                                background: "#eef2ff",
                                border: "1px solid #c7d2fe",
                                padding: "4px 10px",
                                borderRadius: "6px",
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                              }}
                            >
                              Browse All Microcredentials
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Optional Browse All Catalog Section */}
                  {showAllCatalog && (
                    <div
                      style={{
                        marginTop: "16px",
                        padding: "14px",
                        background: "#f1f5f9",
                        borderRadius: "8px",
                        border: "1px solid #cbd5e1",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                        <strong style={{ fontSize: "13px", color: "#1e293b" }}>
                          Full Microcredentials Catalog ({catalog.length} Available Programs)
                        </strong>
                        <button
                          type="button"
                          onClick={() => setShowAllCatalog(false)}
                          style={{
                            background: "none",
                            border: "none",
                            fontSize: "11px",
                            fontWeight: "700",
                            color: "#64748b",
                            cursor: "pointer",
                          }}
                        >
                          ✕ Close
                        </button>
                      </div>
                      <div style={{ maxHeight: "200px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
                        {catalog.map((catItem, cIdx) => (
                          <div
                            key={cIdx}
                            style={{
                              background: "#ffffff",
                              padding: "8px 12px",
                              borderRadius: "6px",
                              border: "1px solid #e2e8f0",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <div>
                              <strong style={{ fontSize: "12px", color: "#1e293b" }}>{catItem.title}</strong>
                              <span style={{ fontSize: "11px", color: "#64748b", marginLeft: "6px" }}>
                                ({catItem.provider} · {catItem.skill_name})
                              </span>
                            </div>
                            {catItem.credential_url && (
                              <a
                                href={catItem.credential_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  fontSize: "11px",
                                  fontWeight: "700",
                                  color: "#4f46e5",
                                  textDecoration: "none",
                                  padding: "3px 8px",
                                  background: "#eef2ff",
                                  borderRadius: "4px",
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
              )}

              {/* ── STEP 16: Experience Recommendation ── */}
              {experienceScore < 80 && (
                <div
                  style={{
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "10px",
                    padding: "14px 16px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: "700", color: "#0f172a" }}>
                      💼 Experience Compatibility ({experienceScore}%)
                    </div>
                    <div style={{ fontSize: "12px", color: "#475569", marginTop: "3px" }}>
                      Make sure your SkillSync profile contains your complete and accurate work history and years of experience.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      navigate("/candidate/profile");
                    }}
                    style={{
                      fontSize: "12px",
                      fontWeight: "700",
                      color: "#475569",
                      background: "#f1f5f9",
                      border: "1px solid #cbd5e1",
                      padding: "8px 14px",
                      borderRadius: "6px",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Edit Profile →
                  </button>
                </div>
              )}

              {/* ── STEP 17: Education Recommendation (Suppressed if 100%) ── */}
              {educationScore < 100 && (
                <div
                  style={{
                    background: "#ffffff",
                    border: "1px solid #e2e8f0",
                    borderRadius: "10px",
                    padding: "14px 16px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: "700", color: "#0f172a" }}>
                      🎓 Education Compatibility ({educationScore}%)
                    </div>
                    <div style={{ fontSize: "12px", color: "#475569", marginTop: "3px" }}>
                      Review your education information and ensure your profile is complete.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      navigate("/candidate/profile");
                    }}
                    style={{
                      fontSize: "12px",
                      fontWeight: "700",
                      color: "#475569",
                      background: "#f1f5f9",
                      border: "1px solid #cbd5e1",
                      padding: "8px 14px",
                      borderRadius: "6px",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Edit Profile →
                  </button>
                </div>
              )}

            </div>
          </div>

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
            borderBottomRightRadius: "16px",
          }}
        >
          {/* STEP 18: Authoritative Recalculate Button */}
          <button
            type="button"
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
              boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
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
                    animation: "spin 1s linear infinite",
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
            type="button"
            onClick={onClose}
            style={{
              padding: "10px 18px",
              background: "#ffffff",
              color: "#475569",
              border: "1px solid #cbd5e1",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
