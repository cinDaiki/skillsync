import { supabase } from "./supabase.js";
import { JOB_TAXONOMY, getAllCategories, getSubcategoriesForCategory, getCategoryLabel, getSubcategoryLabel } from "../constants/jobTaxonomy.js";

/**
 * Career Relevance Tiers definitions
 */
export const CAREER_RELEVANCE_TIERS = {
  HIGHLY_RELATED: {
    key: "Highly Related",
    minScore: 80,
    label: "Highly Related",
    badgeClass: "badge-career-highly-related",
    bgClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    icon: "🎯",
    description: "Strong alignment with candidate's primary occupational skills and career goals."
  },
  RELATED: {
    key: "Related",
    minScore: 60,
    label: "Related",
    badgeClass: "badge-career-related",
    bgClass: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    icon: "💼",
    description: "Good domain compatibility; core skills and background align with this role."
  },
  ADJACENT: {
    key: "Adjacent",
    minScore: 40,
    label: "Adjacent",
    badgeClass: "badge-career-adjacent",
    bgClass: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    icon: "🔄",
    description: "Transferable background with partial domain skill overlap."
  },
  OUTSIDE_FIELD: {
    key: "Outside Primary Field",
    minScore: 0,
    label: "Outside Primary Field",
    badgeClass: "badge-career-outside",
    bgClass: "bg-slate-500/10 text-slate-400 border-slate-500/30",
    icon: "🌐",
    description: "Different occupational domain, but general competencies apply."
  }
};

/**
 * Resolve tier object from score
 */
export function getCareerRelevanceTier(score) {
  const numScore = Number(score) || 0;
  if (numScore >= 80) return CAREER_RELEVANCE_TIERS.HIGHLY_RELATED;
  if (numScore >= 60) return CAREER_RELEVANCE_TIERS.RELATED;
  if (numScore >= 40) return CAREER_RELEVANCE_TIERS.ADJACENT;
  return CAREER_RELEVANCE_TIERS.OUTSIDE_FIELD;
}

/**
 * Compute and save Career Relevance via authoritative server RPC
 */
export async function computeCareerRelevance(jobId, userId = null) {
  try {
    const params = { p_job_id: jobId };
    if (userId) {
      params.p_user_id = userId;
    }
    const { data, error } = await supabase.rpc("compute_and_save_career_relevance", params);
    if (error) {
      console.warn(`[CareerRelevance] RPC failed for job ${jobId}:`, error.message);
      return { success: false, error: error.message };
    }
    return { success: true, ...data };
  } catch (err) {
    console.error(`[CareerRelevance] Exception computing relevance for job ${jobId}:`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Save candidate career preferences
 */
export async function saveCandidateCareerPreferences(userId, {
  preferredCategories = [],
  preferredSubcategories = [],
  preferredRoles = [],
  careerStage = null
}) {
  try {
    const updates = {
      preferred_categories: preferredCategories.slice(0, 3),
      preferred_subcategories: preferredSubcategories.slice(0, 6),
      preferred_roles: preferredRoles.filter(Boolean),
      career_stage: careerStage || null,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from("candidate_profiles")
      .update(updates)
      .eq("user_id", userId)
      .select()
      .maybeSingle();

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error("[CareerRelevance] Failed to save career preferences:", err);
    return { success: false, error: err.message };
  }
}

/**
 * Fetch candidate career preferences
 */
export async function fetchCandidateCareerPreferences(userId) {
  try {
    const { data, error } = await supabase
      .from("candidate_profiles")
      .select("preferred_categories, preferred_subcategories, preferred_roles, career_stage")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;
    return {
      success: true,
      preferences: {
        preferredCategories: data?.preferred_categories || [],
        preferredSubcategories: data?.preferred_subcategories || [],
        preferredRoles: data?.preferred_roles || [],
        careerStage: data?.career_stage || ""
      }
    };
  } catch (err) {
    console.error("[CareerRelevance] Failed to fetch career preferences:", err);
    return {
      success: false,
      error: err.message,
      preferences: {
        preferredCategories: [],
        preferredSubcategories: [],
        preferredRoles: [],
        careerStage: ""
      }
    };
  }
}

export {
  JOB_TAXONOMY,
  getAllCategories,
  getSubcategoriesForCategory,
  getCategoryLabel,
  getSubcategoryLabel
};
