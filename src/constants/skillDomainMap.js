/**
 * skillDomainMap.js
 * 
 * Maps normalized skills to their primary occupational domains (category + subcategory).
 * Crucially distinguishes DOMAIN-DEFINING skills from GENERIC / TRANSFERABLE skills.
 * 
 * Generic skills (communication, teamwork, problem solving, etc.) MUST NOT by themselves
 * establish domain relevance (e.g. they cannot establish that someone is an Accountant or Nurse).
 */

import { normalizeSkillName } from '../services/normalization.js';

// Generic / Transferable skills that span almost all jobs and NEVER establish domain specificity
export const GENERIC_TRANSFERABLE_SKILLS = new Set([
  'communication',
  'teamwork',
  'problem solving',
  'time management',
  'attention to detail',
  'organization',
  'adaptability',
  'leadership',
  'critical thinking',
  'work ethic',
  'collaboration',
  'interpersonal skills',
  'multitasking',
  'presentation skills',
  'report writing',
  'documentation'
]);

/**
 * Domain-Defining Skills Dictionary
 * Each entry specifies:
 * - category: canonical job_category
 * - subcategory: canonical job_subcategory
 * - weight: domain specificity weight (1.0 for core domain-defining skills, 0.5 for boundary/secondary tools)
 */
export const DOMAIN_SKILL_CATALOG = {
  // ── IT & Software: Web Development ──
  'html': { category: 'it_software', subcategory: 'web_development', weight: 1.0 },
  'css': { category: 'it_software', subcategory: 'web_development', weight: 1.0 },
  'javascript': { category: 'it_software', subcategory: 'web_development', weight: 1.0 },
  'typescript': { category: 'it_software', subcategory: 'web_development', weight: 1.0 },
  'react': { category: 'it_software', subcategory: 'web_development', weight: 1.0 },
  'reactjs': { category: 'it_software', subcategory: 'web_development', weight: 1.0 },
  'vue': { category: 'it_software', subcategory: 'web_development', weight: 1.0 },
  'vuejs': { category: 'it_software', subcategory: 'web_development', weight: 1.0 },
  'angular': { category: 'it_software', subcategory: 'web_development', weight: 1.0 },
  'node': { category: 'it_software', subcategory: 'web_development', weight: 1.0 },
  'nodejs': { category: 'it_software', subcategory: 'web_development', weight: 1.0 },
  'express': { category: 'it_software', subcategory: 'web_development', weight: 1.0 },
  'php': { category: 'it_software', subcategory: 'web_development', weight: 1.0 },
  'laravel': { category: 'it_software', subcategory: 'web_development', weight: 1.0 },
  'responsive design': { category: 'it_software', subcategory: 'web_development', weight: 1.0 },
  'tailwind css': { category: 'it_software', subcategory: 'web_development', weight: 0.9 },
  'bootstrap': { category: 'it_software', subcategory: 'web_development', weight: 0.9 },
  'nextjs': { category: 'it_software', subcategory: 'web_development', weight: 1.0 },
  'next js': { category: 'it_software', subcategory: 'web_development', weight: 1.0 },
  'vite': { category: 'it_software', subcategory: 'web_development', weight: 0.8 },
  'rest api': { category: 'it_software', subcategory: 'web_development', weight: 0.9 },
  'git': { category: 'it_software', subcategory: 'web_development', weight: 0.8 },
  'github': { category: 'it_software', subcategory: 'web_development', weight: 0.8 },
  'graphql': { category: 'it_software', subcategory: 'web_development', weight: 0.9 },

  // ── IT & Software: Software & Mobile Development ──
  'python': { category: 'it_software', subcategory: 'software_development', weight: 1.0 },
  'java': { category: 'it_software', subcategory: 'software_development', weight: 1.0 },
  'c#': { category: 'it_software', subcategory: 'software_development', weight: 1.0 },
  'c++': { category: 'it_software', subcategory: 'software_development', weight: 1.0 },
  'flutter': { category: 'it_software', subcategory: 'mobile_development', weight: 1.0 },
  'dart': { category: 'it_software', subcategory: 'mobile_development', weight: 1.0 },
  'android studio': { category: 'it_software', subcategory: 'mobile_development', weight: 1.0 },
  'kotlin': { category: 'it_software', subcategory: 'mobile_development', weight: 1.0 },
  'swift': { category: 'it_software', subcategory: 'mobile_development', weight: 1.0 },
  'react native': { category: 'it_software', subcategory: 'mobile_development', weight: 1.0 },

  // ── IT & Software: Data, AI & Database ──
  'sql': { category: 'it_software', subcategory: 'database_administration', weight: 0.9 },
  'mysql': { category: 'it_software', subcategory: 'database_administration', weight: 1.0 },
  'postgresql': { category: 'it_software', subcategory: 'database_administration', weight: 1.0 },
  'mongodb': { category: 'it_software', subcategory: 'database_administration', weight: 1.0 },
  'sqlite': { category: 'it_software', subcategory: 'database_administration', weight: 0.8 },
  'machine learning': { category: 'it_software', subcategory: 'ai_machine_learning', weight: 1.0 },
  'tensorflow': { category: 'it_software', subcategory: 'ai_machine_learning', weight: 1.0 },
  'pytorch': { category: 'it_software', subcategory: 'ai_machine_learning', weight: 1.0 },
  'opencv': { category: 'it_software', subcategory: 'ai_machine_learning', weight: 1.0 },
  'data analysis': { category: 'it_software', subcategory: 'data_analytics', weight: 1.0 },
  'power bi': { category: 'it_software', subcategory: 'data_analytics', weight: 1.0 },
  'tableau': { category: 'it_software', subcategory: 'data_analytics', weight: 1.0 },

  // ── IT & Software: DevOps & Cloud & Support ──
  'docker': { category: 'it_software', subcategory: 'cloud_devops', weight: 1.0 },
  'kubernetes': { category: 'it_software', subcategory: 'cloud_devops', weight: 1.0 },
  'aws': { category: 'it_software', subcategory: 'cloud_devops', weight: 1.0 },
  'azure': { category: 'it_software', subcategory: 'cloud_devops', weight: 1.0 },
  'linux': { category: 'it_software', subcategory: 'systems_administration', weight: 0.9 },
  'hardware troubleshooting': { category: 'it_software', subcategory: 'it_support_helpdesk', weight: 1.0 },
  'network configuration': { category: 'it_software', subcategory: 'systems_administration', weight: 1.0 },

  // ── Accounting & Finance ──
  'bookkeeping': { category: 'accounting_finance', subcategory: 'bookkeeping', weight: 1.0 },
  'quickbooks': { category: 'accounting_finance', subcategory: 'bookkeeping', weight: 1.0 },
  'xero': { category: 'accounting_finance', subcategory: 'bookkeeping', weight: 1.0 },
  'financial reporting': { category: 'accounting_finance', subcategory: 'general_accounting', weight: 1.0 },
  'auditing': { category: 'accounting_finance', subcategory: 'auditing_assurance', weight: 1.0 },
  'internal audit': { category: 'accounting_finance', subcategory: 'auditing_assurance', weight: 1.0 },
  'tax preparation': { category: 'accounting_finance', subcategory: 'tax_compliance', weight: 1.0 },
  'tax compliance': { category: 'accounting_finance', subcategory: 'tax_compliance', weight: 1.0 },
  'bir compliance': { category: 'accounting_finance', subcategory: 'tax_compliance', weight: 1.0 },
  'payroll processing': { category: 'accounting_finance', subcategory: 'payroll_administration', weight: 1.0 },
  'accounts payable': { category: 'accounting_finance', subcategory: 'general_accounting', weight: 1.0 },
  'accounts receivable': { category: 'accounting_finance', subcategory: 'general_accounting', weight: 1.0 },
  'general ledger': { category: 'accounting_finance', subcategory: 'general_accounting', weight: 1.0 },
  'bank reconciliation': { category: 'accounting_finance', subcategory: 'bookkeeping', weight: 1.0 },
  'financial analysis': { category: 'accounting_finance', subcategory: 'financial_analysis', weight: 1.0 },
  'gaap': { category: 'accounting_finance', subcategory: 'general_accounting', weight: 1.0 },
  'ifrs': { category: 'accounting_finance', subcategory: 'general_accounting', weight: 1.0 },

  // ── Healthcare ──
  'nursing': { category: 'healthcare', subcategory: 'clinical_nursing', weight: 1.0 },
  'patient care': { category: 'healthcare', subcategory: 'clinical_nursing', weight: 1.0 },
  'vital signs': { category: 'healthcare', subcategory: 'clinical_nursing', weight: 1.0 },
  'iv therapy': { category: 'healthcare', subcategory: 'clinical_nursing', weight: 1.0 },
  'wound care': { category: 'healthcare', subcategory: 'clinical_nursing', weight: 1.0 },
  'phlebotomy': { category: 'healthcare', subcategory: 'medical_technology', weight: 1.0 },
  'medication administration': { category: 'healthcare', subcategory: 'clinical_nursing', weight: 1.0 },
  'triage': { category: 'healthcare', subcategory: 'clinical_nursing', weight: 1.0 },
  'bls': { category: 'healthcare', subcategory: 'clinical_nursing', weight: 0.9 },
  'cpr': { category: 'healthcare', subcategory: 'clinical_nursing', weight: 0.8 },
  'pharmacology': { category: 'healthcare', subcategory: 'pharmacy', weight: 1.0 },
  'caregiving': { category: 'healthcare', subcategory: 'caregiving_elderly', weight: 1.0 },

  // ── Administrative & Virtual Assistant ──
  'data entry': { category: 'administrative_va', subcategory: 'data_entry', weight: 1.0 },
  'virtual assistance': { category: 'administrative_va', subcategory: 'virtual_assistance', weight: 1.0 },
  'administrative support': { category: 'administrative_va', subcategory: 'virtual_assistance', weight: 1.0 },
  'email management': { category: 'administrative_va', subcategory: 'virtual_assistance', weight: 1.0 },
  'calendar management': { category: 'administrative_va', subcategory: 'virtual_assistance', weight: 1.0 },
  'google workspace': { category: 'administrative_va', subcategory: 'virtual_assistance', weight: 0.9 },
  'microsoft office': { category: 'administrative_va', subcategory: 'office_administration', weight: 0.8 },
  'microsoft excel': { category: 'administrative_va', subcategory: 'office_administration', weight: 0.8 },
  'microsoft word': { category: 'administrative_va', subcategory: 'office_administration', weight: 0.7 },
  'internet research': { category: 'administrative_va', subcategory: 'virtual_assistance', weight: 0.8 },
  'office administration': { category: 'administrative_va', subcategory: 'office_administration', weight: 1.0 },

  // ── Customer Service & BPO ──
  'customer service': { category: 'customer_service_bpo', subcategory: 'inbound_customer_care', weight: 0.8 },
  'call center': { category: 'customer_service_bpo', subcategory: 'inbound_customer_care', weight: 1.0 },
  'customer support': { category: 'customer_service_bpo', subcategory: 'inbound_customer_care', weight: 0.9 },
  'technical support': { category: 'customer_service_bpo', subcategory: 'technical_support_rep', weight: 1.0 },
  'help desk': { category: 'customer_service_bpo', subcategory: 'technical_support_rep', weight: 0.9 },
  'telesales': { category: 'customer_service_bpo', subcategory: 'outbound_telesales', weight: 1.0 },
  'zendesk': { category: 'customer_service_bpo', subcategory: 'chat_email_support', weight: 1.0 },

  // ── Food & Hospitality ──
  'food handling': { category: 'food_hospitality', subcategory: 'service_crew', weight: 1.0 },
  'cashiering': { category: 'food_hospitality', subcategory: 'service_crew', weight: 0.9 },
  'commercial cooking': { category: 'food_hospitality', subcategory: 'cook_kitchen_prep', weight: 1.0 },
  'food preparation': { category: 'food_hospitality', subcategory: 'cook_kitchen_prep', weight: 1.0 },
  'barista': { category: 'food_hospitality', subcategory: 'barista_bartending', weight: 1.0 },
  'cleaning and sanitation': { category: 'food_hospitality', subcategory: 'service_crew', weight: 0.9 },
  'hospitality': { category: 'food_hospitality', subcategory: 'hotel_front_office', weight: 0.8 },
  'guest relations': { category: 'food_hospitality', subcategory: 'hotel_front_office', weight: 0.9 },

  // ── Retail & Sales ──
  'merchandising': { category: 'retail_sales', subcategory: 'merchandising_display', weight: 1.0 },
  'inventory management': { category: 'retail_sales', subcategory: 'merchandising_display', weight: 0.8 },
  'store operations': { category: 'retail_sales', subcategory: 'store_management', weight: 1.0 },
  'b2b sales': { category: 'retail_sales', subcategory: 'b2b_sales', weight: 1.0 },

  // ── Engineering ──
  'autocad': { category: 'engineering', subcategory: 'architecture_cad', weight: 1.0 },
  'solidworks': { category: 'engineering', subcategory: 'mechanical_engineering', weight: 1.0 },
  'civil engineering': { category: 'engineering', subcategory: 'civil_structural', weight: 1.0 },
  'structural engineering': { category: 'engineering', subcategory: 'civil_structural', weight: 1.0 },
  'electrical engineering': { category: 'engineering', subcategory: 'electrical_engineering', weight: 1.0 },

  // ── Marketing & Creative Design ──
  'digital marketing': { category: 'marketing', subcategory: 'digital_marketing', weight: 1.0 },
  'seo': { category: 'marketing', subcategory: 'seo_sem', weight: 1.0 },
  'sem': { category: 'marketing', subcategory: 'seo_sem', weight: 1.0 },
  'social media marketing': { category: 'marketing', subcategory: 'social_media_mgmt', weight: 1.0 },
  'copywriting': { category: 'marketing', subcategory: 'content_copywriting', weight: 1.0 },
  'ui/ux design': { category: 'creative_design', subcategory: 'ui_ux_design', weight: 1.0 },
  'figma': { category: 'creative_design', subcategory: 'ui_ux_design', weight: 1.0 },
  'graphic design': { category: 'creative_design', subcategory: 'graphic_design', weight: 1.0 },
  'video editing': { category: 'creative_design', subcategory: 'multimedia_video', weight: 1.0 }
};

/**
 * Calculates Skills-Domain Evidence for a given candidate and target job.
 * 
 * Rules:
 * - Generic/transferable skills (communication, teamwork) are excluded from domain evidence.
 * - Looks up domain-defining skills matching the job's category and subcategory.
 * - Saturation threshold: 4 domain-defining skills = 100%.
 * 
 * @param {string[]} candidateSkills - Normalized array of candidate skills
 * @param {string} targetCategory   - Target job_category
 * @param {string} targetSubcategory - Target job_subcategory
 * @returns {{
 *   score: number,
 *   domainSkills: string[],
 *   categoryEvidenceCount: number,
 *   isExcluded: boolean
 * }}
 */
export function calculateSkillsDomainEvidence(candidateSkills = [], targetCategory = null, targetSubcategory = null) {
  if (!Array.isArray(candidateSkills) || candidateSkills.length === 0) {
    return { score: 0, domainSkills: [], categoryEvidenceCount: 0, isExcluded: true };
  }

  // Filter out pure generic skills
  const cleanSkills = candidateSkills
    .map(s => normalizeSkillName(s))
    .filter(s => s && !GENERIC_TRANSFERABLE_SKILLS.has(s));

  if (cleanSkills.length === 0) {
    return { score: 0, domainSkills: [], categoryEvidenceCount: 0, isExcluded: true };
  }

  // If job is Uncategorized, fall back to general non-generic skill count saturation
  if (!targetCategory) {
    const count = cleanSkills.length;
    const score = Math.min(100, Math.round((count / 4) * 100));
    return { score, domainSkills: cleanSkills.slice(0, 5), categoryEvidenceCount: count, isExcluded: false };
  }

  const matchedDomainSkills = [];
  let weightedPoints = 0;

  for (const skill of cleanSkills) {
    const entry = DOMAIN_SKILL_CATALOG[skill];
    if (entry) {
      if (entry.category === targetCategory) {
        let pts = entry.weight;
        // Exact subcategory bonus
        if (targetSubcategory && entry.subcategory === targetSubcategory) {
          pts += 0.2;
        }
        weightedPoints += pts;
        matchedDomainSkills.push(skill);
      }
    }
  }

  if (matchedDomainSkills.length === 0) {
    return { score: 0, domainSkills: [], categoryEvidenceCount: 0, isExcluded: false };
  }

  // Conservative Saturation: 3.5 weighted points (~4 core domain skills) achieves 100%
  const saturationTarget = 3.5;
  const score = Math.min(100, Math.max(0, Math.round((weightedPoints / saturationTarget) * 100)));

  return {
    score,
    domainSkills: matchedDomainSkills,
    categoryEvidenceCount: matchedDomainSkills.length,
    isExcluded: false
  };
}
