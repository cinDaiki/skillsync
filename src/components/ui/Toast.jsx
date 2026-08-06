import { useEffect } from "react";
import "./Toast.css";

export default function Toast({ message, type = "success", onDismiss, duration = 3200 }) {
  useEffect(() => {
    if (!message) return undefined;

    const timer = window.setTimeout(() => {
      onDismiss?.();
    }, duration);

    return () => window.clearTimeout(timer);
  }, [message, duration, onDismiss]);

  if (!message) return null;

  return (
    <div className={`app-toast ${type}`} role="status" aria-live="polite">
      <span className="app-toast-icon">{type === "error" ? "!" : "✓"}</span>
      <p>{message}</p>
      <button type="button" className="app-toast-close" onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
