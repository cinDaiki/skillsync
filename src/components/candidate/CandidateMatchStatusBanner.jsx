import React from "react";

export default function CandidateMatchStatusBanner({
  job,
  eligibility,
  eligibilityLoading = false,
  onOpenImproveMatch,
  onRecalculate,
  recalculating = false
}) {
  if (eligibilityLoading) {
    return (
      <div
        style={{
          background: "#f1f5f9",
          padding: "14px 18px",
          borderRadius: "10px",
          border: "1px solid #cbd5e1",
          fontSize: "13px",
          color: "#475569",
          display: "flex",
          alignItems: "center",
          gap: "10px"
        }}
      >
        <span
          style={{
            width: "14px",
            height: "14px",
            border: "2px solid #64748b",
            borderTopColor: "transparent",
            borderRadius: "50%",
            display: "inline-block",
            animation: "spin 1s linear infinite"
          }}
        />
        <span>Evaluating your authoritative match score against employer requirement...</span>
      </div>
    );
  }

  if (!eligibility && !job) return null;

  const matchScore = eligibility?.matchScore ?? 0;
  const requiredMatch = eligibility?.requiredMatch ?? job?.minimum_match_percentage ?? 70;
  const gap = Math.max(0, requiredMatch - matchScore);
  const isEligible = matchScore >= requiredMatch;

  if (isEligible) {
    return (
      <div
        style={{
          background: "#f0fdf4",
          border: "1px solid #bbf7d0",
          padding: "14px 18px",
          borderRadius: "10px"
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
          <div>
            <div style={{ fontWeight: "800", fontSize: "14px", color: "#166534", display: "flex", alignItems: "center", gap: "6px" }}>
              <span>✓ Eligible to Apply</span>
            </div>
            <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#15803d" }}>
              Your Match: <strong>{matchScore}%</strong> · Required Minimum: <strong>{requiredMatch}%</strong>
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "11px", fontWeight: "700", background: "#dcfce7", color: "#15803d", padding: "4px 10px", borderRadius: "12px" }}>
              Meets Threshold
            </span>
            {onOpenImproveMatch && (
              <button
                type="button"
                onClick={onOpenImproveMatch}
                style={{
                  background: "#ffffff",
                  border: "1px solid #bbf7d0",
                  color: "#166534",
                  fontSize: "12px",
                  fontWeight: "700",
                  padding: "5px 12px",
                  borderRadius: "6px",
                  cursor: "pointer"
                }}
              >
                View Match Breakdown
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // STEP 7: Blocked State UX
  return (
    <div
      style={{
        background: "#fff1f2",
        border: "1px solid #fecdd3",
        padding: "16px 18px",
        borderRadius: "12px"
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px" }}>
        <div>
          <div style={{ fontWeight: "800", fontSize: "14px", color: "#be123c", display: "flex", alignItems: "center", gap: "6px" }}>
            <span>⚠️ Match Requirement Not Met</span>
          </div>
          <p style={{ margin: "6px 0 0 0", fontSize: "13px", color: "#9f1239", fontWeight: "600", lineHeight: "1.4" }}>
            You don't currently meet this employer's minimum match requirement.
          </p>
        </div>
        <span
          style={{
            fontSize: "11px",
            fontWeight: "700",
            background: "#ffe4e6",
            color: "#be123c",
            padding: "4px 10px",
            borderRadius: "10px",
            whiteSpace: "nowrap"
          }}
        >
          Below Minimum
        </span>
      </div>

      {/* Metrics Row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          flexWrap: "wrap",
          margin: "12px 0 14px 0",
          background: "#ffffff",
          padding: "10px 14px",
          borderRadius: "8px",
          border: "1px solid #fed7aa",
          fontSize: "12px"
        }}
      >
        <div>
          <span style={{ color: "#64748b" }}>Your Match: </span>
          <strong style={{ color: "#e11d48", fontSize: "14px" }}>{matchScore}%</strong>
        </div>
        <span style={{ color: "#cbd5e1" }}>·</span>
        <div>
          <span style={{ color: "#64748b" }}>Required Match: </span>
          <strong style={{ color: "#1e293b", fontSize: "14px" }}>{requiredMatch}%</strong>
        </div>
        <span style={{ color: "#cbd5e1" }}>·</span>
        <div>
          <span style={{ color: "#64748b" }}>Difference: </span>
          <strong style={{ color: "#ea580c", fontSize: "13px" }}>
            {gap} percentage point{gap === 1 ? "" : "s"} needed
          </strong>
        </div>
      </div>

      {/* Actions (Step 8 & Step 14) */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
        {onOpenImproveMatch && (
          <button
            type="button"
            onClick={onOpenImproveMatch}
            style={{
              background: "#6f1dce",
              color: "#ffffff",
              border: "none",
              fontSize: "12px",
              fontWeight: "700",
              padding: "7px 14px",
              borderRadius: "6px",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              boxShadow: "0 1px 2px rgba(0,0,0,0.1)"
            }}
          >
            <span>🚀</span> Improve My Match
          </button>
        )}

        {onOpenImproveMatch && (
          <button
            type="button"
            onClick={onOpenImproveMatch}
            style={{
              background: "#ffffff",
              color: "#4c1d95",
              border: "1px solid #ddd6fe",
              fontSize: "12px",
              fontWeight: "700",
              padding: "7px 12px",
              borderRadius: "6px",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px"
            }}
          >
            <span>📊</span> View Match Breakdown
          </button>
        )}

        {onRecalculate && (
          <button
            type="button"
            onClick={onRecalculate}
            disabled={recalculating}
            style={{
              background: "#f8fafc",
              color: "#475569",
              border: "1px solid #cbd5e1",
              fontSize: "12px",
              fontWeight: "600",
              padding: "7px 12px",
              borderRadius: "6px",
              cursor: recalculating ? "not-allowed" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px"
            }}
          >
            {recalculating ? (
              <>
                <span
                  style={{
                    width: "10px",
                    height: "10px",
                    border: "2px solid #64748b",
                    borderTopColor: "transparent",
                    borderRadius: "50%",
                    display: "inline-block",
                    animation: "spin 1s linear infinite"
                  }}
                />
                Recalculating...
              </>
            ) : (
              <>
                <span>🔄</span> Recalculate Match
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
