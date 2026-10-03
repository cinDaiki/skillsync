import React from "react";
import { getCareerRelevanceTier } from "../../services/careerRelevanceService";

/**
 * CareerRelevanceBadge
 *
 * Presentation component that displays server-authoritative Career Relevance.
 *
 * Props:
 *  - score: number | null | undefined
 *  - breakdown: object | null | undefined
 *  - jobCategory: string | null | undefined
 *  - job: object | null | undefined
 *  - layout: 'card' | 'pill' | 'header'
 *  - style: object (optional style overrides)
 */
export default function CareerRelevanceBadge({
  score = null,
  breakdown = null,
  jobCategory = null,
  job = null,
  layout = "card",
  style = {}
}) {
  const category = jobCategory ?? job?.job_category ?? null;
  const isCategorized = Boolean(category && String(category).trim().toLowerCase() !== "null");
  const hasScore = score !== null && score !== undefined && !Number.isNaN(Number(score));
  const numericScore = hasScore ? Math.round(Number(score)) : null;
  const tier = hasScore ? getCareerRelevanceTier(numericScore) : null;

  // Visual Theme by Tier
  const getTheme = () => {
    if (!hasScore) {
      return {
        bg: "#f8fafc",
        border: "#e2e8f0",
        color: "#64748b",
        subColor: "#94a3b8",
        headerColor: "#64748b"
      };
    }
    if (numericScore >= 80) {
      return {
        bg: "#f5f3ff",
        border: "#ddd6fe",
        color: "#6d28d9",
        subColor: "#7c3aed",
        headerColor: "#58158f"
      };
    }
    if (numericScore >= 60) {
      return {
        bg: "#eff6ff",
        border: "#bfdbfe",
        color: "#1d4ed8",
        subColor: "#2563eb",
        headerColor: "#1e40af"
      };
    }
    if (numericScore >= 40) {
      return {
        bg: "#fffbeb",
        border: "#fde68a",
        color: "#b45309",
        subColor: "#d97706",
        headerColor: "#92400e"
      };
    }
    return {
      bg: "#f8fafc",
      border: "#cbd5e1",
      color: "#475569",
      subColor: "#64748b",
      headerColor: "#334155"
    };
  };

  const theme = getTheme();

  // ── Pill Layout (inline row) ────────────────────────────────────────────────
  if (layout === "pill") {
    if (!hasScore) {
      return (
        <span
          className="career-relevance-pill unavailable"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "5px",
            fontSize: "11px",
            fontWeight: "700",
            padding: "2px 8px",
            borderRadius: "10px",
            background: theme.bg,
            border: `1px solid ${theme.border}`,
            color: theme.color,
            ...style
          }}
          title={isCategorized ? "Relevance score not yet calculated" : "Job is not categorized in taxonomy"}
        >
          <span>🧭 Career Relevance:</span>
          <span>{isCategorized ? "Not yet available" : "Uncategorized job"}</span>
        </span>
      );
    }

    return (
      <span
        className={`career-relevance-pill tier-${tier?.key?.toLowerCase().replace(/\s+/g, "-")}`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "5px",
          fontSize: "11px",
          fontWeight: "700",
          padding: "2px 8px",
          borderRadius: "10px",
          background: theme.bg,
          border: `1px solid ${theme.border}`,
          color: theme.color,
          ...style
        }}
        title={`Career Relevance: ${numericScore}% (${tier?.label})`}
      >
        <span>{tier?.icon}</span>
        <span>{numericScore}% Career Relevance</span>
        <span style={{ opacity: 0.6 }}>·</span>
        <span>{tier?.label}</span>
      </span>
    );
  }

  // ── Card Badge Layout (default) ─────────────────────────────────────────────
  if (!hasScore) {
    const statusText = isCategorized ? "Not yet available" : "Uncategorized job";
    return (
      <div
        className="career-relevance-badge unavailable"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "6px 12px",
          borderRadius: "12px",
          background: theme.bg,
          border: `1px solid ${theme.border}`,
          color: theme.color,
          lineHeight: 1.15,
          textAlign: "center",
          minWidth: "105px",
          boxSizing: "border-box",
          ...style
        }}
        title={isCategorized ? "Career relevance has not yet been computed for this job" : "This job is not categorized in occupational taxonomy"}
      >
        <span
          style={{
            fontSize: "9px",
            fontWeight: "800",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            color: theme.headerColor,
            marginBottom: "3px"
          }}
        >
          CAREER RELEVANCE
        </span>
        <span
          style={{
            fontSize: "11px",
            fontWeight: "700",
            color: "#64748b",
            marginTop: "2px"
          }}
        >
          {statusText}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`career-relevance-badge tier-${tier?.key?.toLowerCase().replace(/\s+/g, "-")}`}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "6px 12px",
        borderRadius: "12px",
        background: theme.bg,
        border: `1px solid ${theme.border}`,
        color: theme.color,
        lineHeight: 1.15,
        textAlign: "center",
        minWidth: "105px",
        boxSizing: "border-box",
        ...style
      }}
      title={`Career Relevance: ${numericScore}% — ${tier?.label}`}
    >
      <span
        style={{
          fontSize: "9px",
          fontWeight: "800",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          color: theme.headerColor,
          opacity: 0.9,
          marginBottom: "2px"
        }}
      >
        CAREER RELEVANCE
      </span>
      <span
        style={{
          fontSize: "18px",
          fontWeight: "950",
          lineHeight: "1.1"
        }}
      >
        {numericScore}%
      </span>
      <span
        style={{
          fontSize: "9px",
          fontWeight: "800",
          textTransform: "uppercase",
          letterSpacing: "0.02em",
          color: theme.subColor,
          marginTop: "2px",
          display: "inline-flex",
          alignItems: "center",
          gap: "3px"
        }}
      >
        <span>{tier?.icon}</span>
        <span>{tier?.label}</span>
      </span>
    </div>
  );
}
