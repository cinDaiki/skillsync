import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import AuthTransitionLoader from "../components/common/AuthTransitionLoader";

const AuthTransitionContext = createContext(null);

export const AUTH_TRANSITION = {
  ENTER_MS: 250,
  MIN_VISIBLE_MS: 3000,
  EXIT_START_MS: 3050,
  EXIT_MS: 350,
  NAVIGATE_MS: 3400,
  FINISH_MS: 3750,
  EMERGENCY_MS: 6000,
  REDUCED_NAVIGATE_MS: 750,
  REDUCED_FINISH_MS: 900,
};

function checkPrefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * AuthTransitionProvider
 * Must be placed INSIDE <BrowserRouter> so that useNavigate() and useLocation() work seamlessly.
 */
export function AuthTransitionProvider({ children }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [transitionType, setTransitionType] = useState("signin"); // "signin" | "signup"

  // Ref tracking to guard against memory leaks and race conditions
  const exitTimerRef = useRef(null);
  const navTimerRef = useRef(null);
  const finishTimerRef = useRef(null);
  const safetyTimerRef = useRef(null);
  const isTransitioningRef = useRef(false);
  const isMountedRef = useRef(true);
  const startTimeRef = useRef(0);

  // Clear all active timers safely
  const clearAllTimers = useCallback(() => {
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    if (navTimerRef.current) {
      clearTimeout(navTimerRef.current);
      navTimerRef.current = null;
    }
    if (finishTimerRef.current) {
      clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }
    if (safetyTimerRef.current) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }
  }, []);

  // Cleanup on provider unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearAllTimers();
    };
  }, [clearAllTimers]);

  // Reset transition if user navigates via browser Back/Forward
  useEffect(() => {
    if (isTransitioningRef.current) {
      clearAllTimers();
      isTransitioningRef.current = false;
      if (isMountedRef.current) {
        setIsExiting(false);
        setIsTransitioning(false);
      }
    }
  }, [location.pathname, clearAllTimers]);

  /**
   * navigateToAuth
   * Initiates the noticeable branded visual transition (~3.5s normal, ~750ms reduced-motion) before navigating.
   * 
   * @param {"signin" | "signup"} type
   * @param {string} targetPath - Route destination (defaults to "/sign-in" or "/sign-up")
   */
  const navigateToAuth = useCallback(
    (type = "signin", targetPath = null) => {
      // Prevent duplicate clicks while transition is active
      if (isTransitioningRef.current) return;

      const destination = targetPath || (type === "signup" ? "/sign-up" : "/sign-in");

      // If already on the target route, no transition needed
      if (location.pathname === destination) return;

      clearAllTimers();
      isTransitioningRef.current = true;
      startTimeRef.current = Date.now();

      setTransitionType(type);
      setIsExiting(false);
      setIsTransitioning(true);

      const prefersReduced = checkPrefersReducedMotion();

      if (prefersReduced) {
        // Reduced motion timing (750ms navigate, 900ms finish, static presentation)
        navTimerRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
          navigate(destination);

          finishTimerRef.current = setTimeout(() => {
            if (!isMountedRef.current) return;
            isTransitioningRef.current = false;
            setIsTransitioning(false);
          }, AUTH_TRANSITION.REDUCED_FINISH_MS - AUTH_TRANSITION.REDUCED_NAVIGATE_MS);
        }, AUTH_TRANSITION.REDUCED_NAVIGATE_MS);
      } else {
        // Normal motion sequence (~3.5s total buffer):
        // ~3050ms: Begin exit fade transition
        exitTimerRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
          setIsExiting(true);
        }, AUTH_TRANSITION.EXIT_START_MS);

        // ~3400ms: Navigate to target auth route
        navTimerRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
          navigate(destination);

          // ~3750ms: Complete transition & remove overlay
          finishTimerRef.current = setTimeout(() => {
            if (!isMountedRef.current) return;
            isTransitioningRef.current = false;
            setIsExiting(false);
            setIsTransitioning(false);
          }, AUTH_TRANSITION.FINISH_MS - AUTH_TRANSITION.NAVIGATE_MS);
        }, AUTH_TRANSITION.NAVIGATE_MS);
      }

      // Emergency safety fallback (6000ms) to guarantee overlay is NEVER stuck
      safetyTimerRef.current = setTimeout(() => {
        if (!isMountedRef.current) return;
        isTransitioningRef.current = false;
        setIsExiting(false);
        setIsTransitioning(false);
      }, AUTH_TRANSITION.EMERGENCY_MS);
    },
    [navigate, location.pathname, clearAllTimers]
  );

  return (
    <AuthTransitionContext.Provider value={{ navigateToAuth, isTransitioning, isExiting, transitionType }}>
      {children}
      {/* Root Transition Overlay */}
      <AuthTransitionLoader
        type={transitionType}
        isVisible={isTransitioning}
        isExiting={isExiting}
      />
    </AuthTransitionContext.Provider>
  );
}

/**
 * useAuthTransition Hook
 */
export function useAuthTransition() {
  const context = useContext(AuthTransitionContext);
  if (!context) {
    throw new Error("useAuthTransition must be used within an AuthTransitionProvider");
  }
  return context;
}
