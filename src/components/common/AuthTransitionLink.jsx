import React from "react";
import { Link } from "react-router-dom";
import { useAuthTransition } from "../../context/AuthTransitionContext";

/**
 * Checks if the click event is accompanied by modifier keys (e.g. Cmd+click, Ctrl+click)
 * to open in a new tab/window, which should preserve native browser behavior.
 */
function isModifiedEvent(event) {
  return !!(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey);
}

/**
 * AuthTransitionLink
 * Wraps React Router's <Link> to provide smooth transition animations while
 * preserving semantic HTML anchors, accessibility, SEO, and keyboard navigation.
 */
export default function AuthTransitionLink({
  to,
  type = "signin", // "signin" | "signup"
  className = "",
  children,
  onClick,
  ...rest
}) {
  const { navigateToAuth, isTransitioning } = useAuthTransition();

  function handleClick(e) {
    if (onClick) {
      onClick(e);
    }

    // Preserve native behavior for modifier keys or non-primary clicks
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      isModifiedEvent(e) ||
      rest.target === "_blank"
    ) {
      return;
    }

    // Intercept standard click to show transition
    e.preventDefault();
    if (!isTransitioning) {
      navigateToAuth(type, to);
    }
  }

  // Ensure button microinteraction styling is included
  const combinedClassName = `auth-nav-link ${className}`.trim();

  return (
    <Link
      to={to}
      className={combinedClassName}
      onClick={handleClick}
      aria-busy={isTransitioning ? "true" : undefined}
      {...rest}
    >
      {children}
    </Link>
  );
}
