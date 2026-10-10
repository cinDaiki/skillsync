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
 * Extract / format clean evidence explanation bullets from authoritative server breakdown
 */
export function getCareerRelevanceEvidenceBullets(breakdown, jobCategory = null) {
  if (!breakdown || typeof breakdown !== "object") return [];
  if (Array.isArray(breakdown.evidenceBullets) && breakdown.evidenceBullets.length > 0) {
    return breakdown.evidenceBullets;
  }

  const bullets = [];
  const catLabel = jobCategory ? getCategoryLabel(jobCategory) : "role domain";

  // 1. Domain Skills (30%)
  if (Array.isArray(breakdown.domainSkills) && breakdown.domainSkills.length > 0) {
    bullets.push(`${catLabel} skills align with this role (${breakdown.domainSkills.slice(0, 4).join(", ")})`);
  } else if (breakdown.skillsScore !== undefined && breakdown.skillsScore > 0) {
    bullets.push(`Partial domain skills align with this role`);
  }

  // 2. Work History (20%)
  if (breakdown.workHistoryScore >= 70) {
    bullets.push(`Work history strongly aligned with ${catLabel}`);
  } else if (breakdown.workHistoryScore >= 40) {
    bullets.push(`Work history has transferable experience for ${catLabel}`);
  }

  // 3. Projects (20%)
  if (breakdown.projectsScore >= 70) {
    bullets.push(`Relevant projects and portfolio in ${catLabel}`);
  } else if (breakdown.projectsScore >= 40) {
    bullets.push(`Portfolio projects with applicable domain skills`);
  }

  // 4. Career Preferences (15%)
  if (breakdown.preferencesScore >= 70) {
    bullets.push(`Directly matches current ${catLabel} career preference`);
  }

  // 5. Education Field (5%)
  if (breakdown.educationFieldScore >= 70) {
    bullets.push(`Academic background / coursework in ${catLabel}`);
  }

  // 6. Semantic (10%)
  if (breakdown.semanticScore >= 70) {
    bullets.push(`High conceptual role title and background alignment`);
  }

  return bullets;
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
