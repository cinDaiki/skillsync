import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import AuthActionLoader from "../components/common/AuthActionLoader";
import { signOut } from "../services/authService";

const AuthActionContext = createContext(null);

export const AUTH_ACTION_CONFIG = {
  LOGIN_NORMAL_MIN_MS: 2800,
  LOGIN_REDUCED_MIN_MS: 750,
  LOGOUT_NORMAL_MIN_MS: 2500,
  LOGOUT_REDUCED_MIN_MS: 750,
  EXIT_FADE_MS: 250,
  SAFETY_TIMEOUT_MS: 7500,
};

function checkPrefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * AuthActionProvider
 * Global provider for real login submissions and logout loading buffers.
 * Placed inside <BrowserRouter> at the app root level so it survives authentication state changes
 * and dashboard layout unmounting.
 */
export function AuthActionProvider({ children }) {
  const navigate = useNavigate();

  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [mode, setMode] = useState("login"); // "login" | "logout"
  const [stage, setStage] = useState("pending"); // "pending" | "success" | "ready" | "logout_initial" | "logout_final"

  const activeTimersRef = useRef([]);
  const isExecutingRef = useRef(false);
  const isMountedRef = useRef(true);

  const clearAllTimers = useCallback(() => {
    activeTimersRef.current.forEach((t) => clearTimeout(t));
    activeTimersRef.current = [];
  }, []);

  const addTimer = useCallback((fn, delay) => {
    const timerId = setTimeout(fn, delay);
    activeTimersRef.current.push(timerId);
    return timerId;
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      clearAllTimers();
    };
  }, [clearAllTimers]);

  /**
   * cancelAction
   * Immediately clears and closes the loader (e.g. on auth error or OTP required).
   */
  const cancelAction = useCallback(() => {
    clearAllTimers();
    isExecutingRef.current = false;
    if (isMountedRef.current) {
      setIsExiting(false);
      setIsVisible(false);
    }
  }, [clearAllTimers]);

  /**
   * executeLogin
   * Executes a real authentication function immediately.
   * - If auth fails or requires OTP: loader closes IMMEDIATELY with no cosmetic delay.
   * - If auth succeeds before 2.8s: waits remaining visual buffer, displaying state-aware copy.
   * - If auth succeeds after 2.8s: transitions as soon as safe (~350ms).
   * 
   * @param {() => Promise<{ success: boolean, requiresOtp?: boolean, error?: any, onSuccess?: () => void }>} authFn
   */
  const executeLogin = useCallback(
    async (authFn) => {
      if (isExecutingRef.current) return;
      isExecutingRef.current = true;
      clearAllTimers();

      const prefersReduced = checkPrefersReducedMotion();
      const minDuration = prefersReduced
        ? AUTH_ACTION_CONFIG.LOGIN_REDUCED_MIN_MS
        : AUTH_ACTION_CONFIG.LOGIN_NORMAL_MIN_MS;

      setMode("login");
      setStage("pending");
      setIsExiting(false);
      setIsVisible(true);

      const startTime = Date.now();

      // Safety timeout guard
      addTimer(() => {
        if (isExecutingRef.current && isMountedRef.current) {
          isExecutingRef.current = false;
          setIsVisible(false);
          setIsExiting(false);
        }
      }, AUTH_ACTION_CONFIG.SAFETY_TIMEOUT_MS);

      try {
        // 1. Real authentication begins immediately
        const result = await authFn();

        // 2. If auth failed, or step-up OTP challenge is required: EXIT IMMEDIATELY
        if (!result || result.success !== true) {
          cancelAction();
          return result;
        }

        // 3. Auth succeeded: update stage to preparing secure session
        setStage("success");

        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, minDuration - elapsed);

        if (prefersReduced) {
          if (remaining > 0) {
            await new Promise((r) => addTimer(r, remaining));
          }
          if (result.onSuccess) {
            result.onSuccess();
          }
          cancelAction();
          return result;
        }

        // Normal motion staged sequence
        if (remaining > 500) {
          // Wait until 500ms before completion
          await new Promise((r) => addTimer(r, remaining - 500));
          setStage("ready"); // "Almost ready..." / "Redirecting to your dashboard..."

          // 250ms before completion: start exit fade
          await new Promise((r) => addTimer(r, 250));
          setIsExiting(true);

          await new Promise((r) => addTimer(r, AUTH_ACTION_CONFIG.EXIT_FADE_MS));
        } else {
          // Slower network (>2.8s): brief safe transition
          setStage("ready");
          await new Promise((r) => addTimer(r, 200));
          setIsExiting(true);
          await new Promise((r) => addTimer(r, 150));
        }

        if (result.onSuccess) {
          result.onSuccess();
        }

        cancelAction();
        return result;
      } catch (err) {
        // Immediate exit on unexpected exception
        cancelAction();
        throw err;
      }
    },
    [cancelAction, clearAllTimers, addTimer]
  );

  /**
   * executeLogout
   * Executes session sign-out immediately, while keeping global loader visible
   * for the duration of the visual buffer (~2.5s normal motion, ~750ms reduced motion),
   * then redirects to Home ("/") with { replace: true }.
   * 
   * @param {() => Promise<void>} [customSignOutFn]
   * @param {string} [redirectPath="/"]
   */
  const executeLogout = useCallback(
    async (customSignOutFn, redirectPath = "/") => {
      if (isExecutingRef.current) return;
      isExecutingRef.current = true;
      clearAllTimers();

      const prefersReduced = checkPrefersReducedMotion();
      const minDuration = prefersReduced
        ? AUTH_ACTION_CONFIG.LOGOUT_REDUCED_MIN_MS
        : AUTH_ACTION_CONFIG.LOGOUT_NORMAL_MIN_MS;

      setMode("logout");
      setStage("logout_initial");
      setIsExiting(false);
      setIsVisible(true);

      const startTime = Date.now();

      // Emergency safety guard
      addTimer(() => {
        if (isExecutingRef.current && isMountedRef.current) {
          isExecutingRef.current = false;
          setIsVisible(false);
          setIsExiting(false);
        }
      }, AUTH_ACTION_CONFIG.SAFETY_TIMEOUT_MS);

      // 1. Session termination happens immediately!
      try {
        if (customSignOutFn) {
          await customSignOutFn();
        } else {
          await signOut();
        }
      } catch (err) {
        console.warn("Error during session sign-out:", err);
      } finally {
        try {
          localStorage.removeItem("skillsync_user");
          localStorage.removeItem("skillsync_session");
        } catch {}
      }

      // 2. Maintain visual loader until minimum duration completes
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, minDuration - elapsed);

      if (prefersReduced) {
        if (remaining > 0) {
          await new Promise((r) => addTimer(r, remaining));
        }
        navigate(redirectPath, { replace: true });
        cancelAction();
        return;
      }

      // Normal motion: show "Almost done..." for the last ~600ms, exit fade for last ~250ms
      if (remaining > 600) {
        await new Promise((r) => addTimer(r, remaining - 600));
        setStage("logout_final");

        await new Promise((r) => addTimer(r, 350));
        setIsExiting(true);

        await new Promise((r) => addTimer(r, AUTH_ACTION_CONFIG.EXIT_FADE_MS));
      } else {
        setStage("logout_final");
        await new Promise((r) => addTimer(r, 200));
        setIsExiting(true);
        await new Promise((r) => addTimer(r, 150));
      }

      // 3. Final navigation to Home "/" with replace: true
      navigate(redirectPath, { replace: true });

      cancelAction();
    },
    [navigate, cancelAction, clearAllTimers, addTimer]
  );

  return (
    <AuthActionContext.Provider
      value={{
        executeLogin,
        executeLogout,
        cancelAction,
        isActionLoading: isVisible,
        actionStage: stage,
        actionMode: mode,
      }}
    >
      {children}
      {/* High-level Global Loader Overlay */}
      <AuthActionLoader
        isVisible={isVisible}
        isExiting={isExiting}
        mode={mode}
        stage={stage}
      />
    </AuthActionContext.Provider>
  );
}

/**
 * useAuthAction Hook
 */
export function useAuthAction() {
  const context = useContext(AuthActionContext);
  if (!context) {
    throw new Error("useAuthAction must be used within an AuthActionProvider");
  }
  return context;
}
