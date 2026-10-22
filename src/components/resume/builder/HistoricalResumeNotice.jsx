import React, { useState } from "react";
import { getResumeViewUrl } from "../../../services/api";

export default function HistoricalResumeNotice({ historicalResume }) {
  const [downloading, setDownloading] = useState(false);
  const [opening, setOpening] = useState(false);

  if (!historicalResume?.file_url) return null;

  async function handleViewOriginal() {
    setOpening(true);
    try {
      const { url } = await getResumeViewUrl(historicalResume.file_url, 900);
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (_) {
      // silent retry
    } finally {
      setOpening(false);
    }
  }

  async function handleDownloadOriginal() {
    setDownloading(true);
    try {
      const { url } = await getResumeViewUrl(historicalResume.file_url, 900);
      if (url) {
        const a = document.createElement("a");
        a.href = url;
        a.download = historicalResume.file_name || "original_resume.pdf";
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (_) {
      // silent retry
    } finally {
      setDownloading(false);
    }
  }

  function formatFileSize(bytes) {
    if (!bytes) return "";
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  const uploadDate = historicalResume.created_at
    ? new Date(historicalResume.created_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric"
      })
    : "";

  return (
    <div className="historical-resume-notice compact" role="region" aria-label="Original Document">
      <div className="historical-notice-icon" aria-hidden="true">📄</div>
      <div className="historical-notice-info">
        <span className="historical-notice-badge">Previously uploaded resume available</span>
        <div className="historical-notice-title">
          {historicalResume.file_name}
        </div>
        <div className="historical-notice-meta">
          {[formatFileSize(historicalResume.file_size), uploadDate].filter(Boolean).join(" • ")}
        </div>
      </div>
      <div className="historical-notice-actions">
        <button
          type="button"
          onClick={handleViewOriginal}
          className="historical-view-btn"
          disabled={opening}
          title="View your previously uploaded resume in a new tab"
        >
          {opening ? "Opening..." : "View Original"}
        </button>
        <button
          type="button"
          onClick={handleDownloadOriginal}
          className="historical-download-btn"
          disabled={downloading}
          title="Download your previously uploaded document"
        >
          {downloading ? "Preparing..." : "Download"}
        </button>
      </div>
    </div>
  );
}
