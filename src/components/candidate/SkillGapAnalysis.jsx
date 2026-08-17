import React from 'react';
import { analyzeJobSkillGap } from '../../services/ai/jobFitEngine';

/**
 * Format skill name for presentation (handles acronyms like AWS, CRM, SQL, HTML, CSS, etc.)
 */
function formatSkillTitle(skill) {
  if (!skill || typeof skill !== 'string') return '';
  const trimmed = skill.trim();
  const upper = trimmed.toUpperCase();
  const knownAcronyms = ['AWS', 'CRM', 'SQL', 'HTML', 'CSS', 'JS', 'TS', 'PHP', 'API', 'REST', 'RESTFUL', 'POS', 'UI', 'UX', 'CI', 'CD', 'CI/CD', 'CKAD', 'PMP', 'CCNA', 'BPO', 'TOP', 'NC', 'NC2', 'NC3', 'AI', 'ML', 'SIEM', 'IAM', 'EC2', 'S3'];
  
  if (knownAcronyms.includes(upper)) {
    return upper;
  }
  
  return trimmed
    .split(/\s+/)
    .map(word => {
      const wUpper = word.toUpperCase();
      if (knownAcronyms.includes(wUpper)) return wUpper;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Shared SkillGapAnalysis Component
 * Used across Recommended Jobs, Job Marketplace, and Candidate Job Details modals.
 * Renders consistent canonical skill gap evaluation and multi-source microcredential recommendations.
 */
export default function SkillGapAnalysis({ job, candidate = {}, analysis = null }) {
  const gapResult = analysis || analyzeJobSkillGap(candidate, job);
  const {
    requiredSkills = [],
    matchedSkills = [],
    missingSkills = [],
    alignmentStatus = 'analysis_unavailable',
    microcredentials = []
  } = gapResult;

  return (
    <div style={{ background: "#f8fafc", padding: "16px 20px", borderRadius: "12px", border: "1px solid #e2e8f0", marginTop: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", flexWrap: "wrap", gap: "8px" }}>
        <h4 style={{ color: "#1e1b4b", margin: 0, fontSize: "15px", fontWeight: "800", display: "flex", alignItems: "center", gap: "8px" }}>
          🧠 Skill Gap Analysis & Microcredentials
        </h4>
        {requiredSkills.length > 0 && (
          <span style={{ fontSize: "11px", fontWeight: "700", background: "#e2e8f0", color: "#334155", padding: "3px 10px", borderRadius: "12px" }}>
            {requiredSkills.length} Required Skill{requiredSkills.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* ── STATE C: REQUIREMENTS COULD NOT BE DETERMINED ── */}
      {alignmentStatus === 'analysis_unavailable' && (
        <div style={{ padding: "14px 16px", borderRadius: "8px", background: "#f0f9ff", border: "1px solid #bae6fd", color: "#0369a1" }}>
          <div style={{ fontWeight: "700", fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" }}>
            ℹ️ Skill Analysis Unavailable
          </div>
          <p style={{ margin: "6px 0 0 0", fontSize: "13px", color: "#334155", lineHeight: "1.5" }}>
            SkillSync could not identify structured skill requirements for this job listing, so skill-gap and microcredential recommendations cannot be calculated reliably.
          </p>
        </div>
      )}

      {/* ── STATE A & B: STRUCTURED REQUIREMENTS PRESENT ── */}
      {alignmentStatus !== 'analysis_unavailable' && (
        <>
          {/* Skills You Have vs Skills You're Missing */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "8px" }}>
            {/* Matched Skills */}
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "12px", borderRadius: "8px" }}>
              <strong style={{ fontSize: "12px", color: "#15803d", display: "block", marginBottom: "6px" }}>
                ✓ Skills You Have ({matchedSkills.length})
              </strong>
              {matchedSkills.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {matchedSkills.map((s, idx) => (
                    <span key={idx} style={{ background: "#dcfce7", color: "#166534", fontSize: "11px", fontWeight: "600", padding: "3px 8px", borderRadius: "12px" }}>
                      ✓ {formatSkillTitle(s)}
                    </span>
                  ))}
                </div>
              ) : (
                <span style={{ fontSize: "12px", color: "#64748b" }}>No direct required skill matches identified.</span>
              )}
            </div>

            {/* Missing Skills */}
            <div style={{ background: "#fff1f2", border: "1px solid #fecdd3", padding: "12px", borderRadius: "8px" }}>
              <strong style={{ fontSize: "12px", color: "#be123c", display: "block", marginBottom: "6px" }}>
                ⚠ Skills You're Missing ({missingSkills.length})
              </strong>
              {missingSkills.length > 0 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {missingSkills.map((s, idx) => (
                    <span key={idx} style={{ background: "#ffe4e6", color: "#9f1239", fontSize: "11px", fontWeight: "600", padding: "3px 8px", borderRadius: "12px" }}>
                      ⚠ {formatSkillTitle(s)}
                    </span>
                  ))}
                </div>
              ) : (
                <div style={{ color: "#15803d", fontSize: "12px", fontWeight: "600" }}>
                  🎉 All required skills covered!
                </div>
              )}
            </div>
          </div>

          {/* STATE A: True Full Alignment Banner */}
          {alignmentStatus === 'full_alignment' && (
            <div style={{ marginTop: "14px", padding: "12px 16px", borderRadius: "8px", background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", fontSize: "13px" }}>
              🎉 <strong>Full Skill Alignment:</strong> Your current skills cover all identified requirements for this role. No skill-gap microcredentials are currently recommended.
            </div>
          )}

          {/* STATE B: Recommended Microcredentials Section */}
          {microcredentials.length > 0 && (
            <div style={{ marginTop: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <strong style={{ fontSize: "14px", color: "#1e1b4b" }}>
                  🎓 Recommended Credentials to Close Skill Gaps
                </strong>
                <span style={{ fontSize: "11px", color: "#64748b", background: "#f1f5f9", padding: "3px 8px", borderRadius: "12px", fontWeight: "600" }}>
                  {microcredentials.length} verified program{microcredentials.length > 1 ? "s" : ""}
                </span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {microcredentials.map((mc, mIdx) => {
                  const coveredGaps = mc.coveredSkills || (mc.skill_name ? [mc.skill_name] : []);
                  const hasUrl = mc.url && mc.url !== '#' && mc.url.startsWith('http');
                  const formatType = (mc.credentialType || "Course").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

                  let sourceBg = "#e0f2fe";
                  let sourceColor = "#0369a1";
                  let sourceBorder = "#bae6fd";
                  if (mc.sourceType === "tesda") {
                    sourceBg = "#fef3c7";
                    sourceColor = "#92400e";
                    sourceBorder = "#fde68a";
                  } else if (mc.sourceType === "industry_provider") {
                    sourceBg = "#f3e8ff";
                    sourceColor = "#6b21a8";
                    sourceBorder = "#e9d5ff";
                  } else if (mc.sourceType === "open_badge") {
                    sourceBg = "#dcfce7";
                    sourceColor = "#166534";
                    sourceBorder = "#bbf7d0";
                  }

                  return (
                    <div key={mc.id || mIdx} style={{ background: "#ffffff", border: "1px solid #cbd5e1", padding: "14px 16px", borderRadius: "10px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
                        <div style={{ flex: 1, minWidth: "260px" }}>
                          <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap", marginBottom: "6px" }}>
                            <span style={{ fontSize: "11px", fontWeight: "700", background: sourceBg, color: sourceColor, border: `1px solid ${sourceBorder}`, padding: "2px 8px", borderRadius: "4px" }}>
                              🏛️ {mc.provider}
                            </span>
                            <span style={{ fontSize: "11px", fontWeight: "600", background: "#f1f5f9", color: "#475569", padding: "2px 8px", borderRadius: "4px" }}>
                              📋 {formatType}
                            </span>
                            {mc.level && (
                              <span style={{ fontSize: "11px", color: "#64748b", background: "#f8fafc", padding: "2px 6px", borderRadius: "4px", border: "1px solid #e2e8f0" }}>
                                📊 {mc.level}
                              </span>
                            )}
                            {mc.duration && (
                              <span style={{ fontSize: "11px", color: "#64748b", background: "#f8fafc", padding: "2px 6px", borderRadius: "4px", border: "1px solid #e2e8f0" }}>
                                ⏱️ {mc.duration}
                              </span>
                            )}
                          </div>

                          <h5 style={{ margin: "0 0 6px 0", fontSize: "14px", fontWeight: "800", color: "#0f172a" }}>
                            {mc.title}
                          </h5>

                          <p style={{ margin: "0 0 10px 0", fontSize: "12px", color: "#475569", lineHeight: "1.5" }}>
                            {mc.description}
                          </p>

                          {/* Multi-skill coverage indicators */}
                          {coveredGaps.length > 0 && (
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "6px" }}>
                              <span style={{ fontSize: "11px", fontWeight: "700", color: "#0369a1" }}>
                                🎯 Helps close ({coveredGaps.length} missing skill{coveredGaps.length > 1 ? "s" : ""}):
                              </span>
                              {coveredGaps.map((gap, gIdx) => (
                                <span key={gIdx} style={{ fontSize: "11px", background: "#e0f2fe", color: "#0369a1", padding: "1px 6px", borderRadius: "8px", fontWeight: "600" }}>
                                  {formatSkillTitle(gap)}
                                </span>
                              ))}
                            </div>
                          )}

                          <div style={{ fontSize: "11px", color: "#64748b" }}>
                            💡 <strong>Reason:</strong> {formatSkillTitle(mc.skill_name || coveredGaps[0] || 'Required skill')} is required by this role and is currently a skill gap.
                          </div>
                        </div>

                        {/* CTA button */}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                          {hasUrl ? (
                            <a
                              href={mc.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px",
                                background: "#6f1dce",
                                color: "#ffffff",
                                fontSize: "12px",
                                fontWeight: "700",
                                padding: "8px 14px",
                                borderRadius: "6px",
                                textDecoration: "none",
                                whiteSpace: "nowrap",
                                boxShadow: "0 1px 2px rgba(0,0,0,0.1)"
                              }}
                            >
                              View Credential ↗
                            </a>
                          ) : (
                            <span style={{ fontSize: "11px", color: "#94a3b8", fontStyle: "italic" }}>
                              Official credential link currently unavailable.
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Missing skills exist but 0 registered credentials */}
          {missingSkills.length > 0 && microcredentials.length === 0 && (
            <div style={{ marginTop: "14px", padding: "12px 16px", borderRadius: "8px", background: "#f8fafc", border: "1px solid #cbd5e1", color: "#475569", fontSize: "12px" }}>
              ℹ️ No verified credential recommendation is currently registered for the identified skill gap(s).
            </div>
          )}
        </>
      )}
    </div>
  );
}
