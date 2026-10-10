/**
 * jobTaxonomy.js
 * 
 * Central canonical registry for SkillSync Universal Job Taxonomy (Phase 4C).
 * Defines exactly 18 top-level categories and 97 controlled subcategories.
 * Mirrors the database reference tables (public.job_categories and public.job_subcategories).
 */

export const JOB_TAXONOMY = {
  it_software: {
    key: "it_software",
    label: "IT & Software",
    sort_order: 1,
    subcategories: [
      { key: "web_development", label: "Web Development", sort_order: 1 },
      { key: "software_development", label: "Software Development", sort_order: 2 },
      { key: "mobile_development", label: "Mobile Development", sort_order: 3 },
      { key: "it_support_helpdesk", label: "IT Support & Helpdesk", sort_order: 4 },
      { key: "systems_administration", label: "Systems & Network Administration", sort_order: 5 },
      { key: "cloud_devops", label: "Cloud & DevOps", sort_order: 6 },
      { key: "cybersecurity", label: "Cybersecurity", sort_order: 7 },
      { key: "data_analytics", label: "Data & Analytics", sort_order: 8 },
      { key: "database_administration", label: "Database Administration", sort_order: 9 },
      { key: "qa_testing", label: "QA & Software Testing", sort_order: 10 },
      { key: "ai_machine_learning", label: "AI & Machine Learning", sort_order: 11 }
    ]
  },
  accounting_finance: {
    key: "accounting_finance",
    label: "Accounting & Finance",
    sort_order: 2,
    subcategories: [
      { key: "general_accounting", label: "General Accounting", sort_order: 1 },
      { key: "bookkeeping", label: "Bookkeeping", sort_order: 2 },
      { key: "auditing_assurance", label: "Auditing & Assurance", sort_order: 3 },
      { key: "tax_compliance", label: "Tax Compliance", sort_order: 4 },
      { key: "payroll_administration", label: "Payroll Administration", sort_order: 5 },
      { key: "financial_analysis", label: "Financial Planning & Analysis", sort_order: 6 },
      { key: "banking_lending", label: "Banking & Lending", sort_order: 7 }
    ]
  },
  healthcare: {
    key: "healthcare",
    label: "Healthcare",
    sort_order: 3,
    subcategories: [
      { key: "clinical_nursing", label: "Clinical Nursing", sort_order: 1 },
      { key: "medical_technology", label: "Medical Technology & Laboratory", sort_order: 2 },
      { key: "pharmacy", label: "Pharmacy", sort_order: 3 },
      { key: "caregiving_elderly", label: "Caregiving & Patient Support", sort_order: 4 },
      { key: "healthcare_admin", label: "Healthcare Administration", sort_order: 5 },
      { key: "physical_therapy", label: "Physical Therapy & Rehabilitation", sort_order: 6 },
      { key: "dental_services", label: "Dental Care & Assistance", sort_order: 7 }
    ]
  },
  administrative_va: {
    key: "administrative_va",
    label: "Administrative & Virtual Assistant",
    sort_order: 4,
    subcategories: [
      { key: "virtual_assistance", label: "General Virtual Assistance", sort_order: 1 },
      { key: "data_entry", label: "Data Entry & Processing", sort_order: 2 },
      { key: "executive_assistance", label: "Executive & Administrative Assistance", sort_order: 3 },
      { key: "office_administration", label: "Office Administration & Facilities", sort_order: 4 },
      { key: "ecommerce_management", label: "E-Commerce Virtual Assistance", sort_order: 5 }
    ]
  },
  customer_service_bpo: {
    key: "customer_service_bpo",
    label: "Customer Service & BPO",
    sort_order: 5,
    subcategories: [
      { key: "inbound_customer_care", label: "Inbound Customer Care", sort_order: 1 },
      { key: "technical_support_rep", label: "Technical Support Representation", sort_order: 2 },
      { key: "outbound_telesales", label: "Outbound Telesales & Retention", sort_order: 3 },
      { key: "chat_email_support", label: "Chat & Email Non-Voice Support", sort_order: 4 },
      { key: "bpo_quality_leadership", label: "BPO Quality & Team Leadership", sort_order: 5 }
    ]
  },
  food_hospitality: {
    key: "food_hospitality",
    label: "Food & Hospitality",
    sort_order: 6,
    subcategories: [
      { key: "service_crew", label: "Fast Food & Service Crew", sort_order: 1 },
      { key: "cook_kitchen_prep", label: "Cook & Kitchen Preparation", sort_order: 2 },
      { key: "barista_bartending", label: "Barista & Beverage Preparation", sort_order: 3 },
      { key: "restaurant_operations", label: "Restaurant Supervision & Floor", sort_order: 4 },
      { key: "hotel_front_office", label: "Hotel Front Office & Concierge", sort_order: 5 },
      { key: "housekeeping", label: "Housekeeping & Facility Upkeep", sort_order: 6 }
    ]
  },
  retail_sales: {
    key: "retail_sales",
    label: "Retail & Sales",
    sort_order: 7,
    subcategories: [
      { key: "retail_cashier", label: "Retail Cashiering", sort_order: 1 },
      { key: "store_associate", label: "Store Sales Associate", sort_order: 2 },
      { key: "merchandising_display", label: "Merchandising & Stock Management", sort_order: 3 },
      { key: "b2b_sales", label: "B2B & Corporate Account Executive", sort_order: 4 },
      { key: "store_management", label: "Retail Store Management", sort_order: 5 }
    ]
  },
  engineering: {
    key: "engineering",
    label: "Engineering",
    sort_order: 8,
    subcategories: [
      { key: "civil_structural", label: "Civil & Structural Engineering", sort_order: 1 },
      { key: "mechanical_engineering", label: "Mechanical Engineering", sort_order: 2 },
      { key: "electrical_engineering", label: "Electrical Engineering", sort_order: 3 },
      { key: "electronics_communications", label: "Electronics & Communications Engineering", sort_order: 4 },
      { key: "industrial_systems", label: "Industrial & Systems Engineering", sort_order: 5 },
      { key: "architecture_cad", label: "Architectural Drafting & 3D CAD", sort_order: 6 }
    ]
  },
  education: {
    key: "education",
    label: "Education",
    sort_order: 9,
    subcategories: [
      { key: "k12_teaching", label: "Primary & Secondary Education (K-12)", sort_order: 1 },
      { key: "higher_education", label: "College & University Instruction", sort_order: 2 },
      { key: "special_education", label: "Special Education (SPED)", sort_order: 3 },
      { key: "esl_language_tutoring", label: "ESL & Language Tutoring", sort_order: 4 },
      { key: "corporate_training", label: "Corporate Training & Instructional Design", sort_order: 5 }
    ]
  },
  marketing: {
    key: "marketing",
    label: "Marketing",
    sort_order: 10,
    subcategories: [
      { key: "digital_marketing", label: "Digital Marketing & Performance Ads", sort_order: 1 },
      { key: "seo_sem", label: "SEO & SEM Optimization", sort_order: 2 },
      { key: "social_media_mgmt", label: "Social Media Management", sort_order: 3 },
      { key: "content_copywriting", label: "Content Creation & Copywriting", sort_order: 4 },
      { key: "brand_strategy_pr", label: "Brand Strategy & Public Relations", sort_order: 5 }
    ]
  },
  human_resources: {
    key: "human_resources",
    label: "Human Resources",
    sort_order: 11,
    subcategories: [
      { key: "talent_recruitment", label: "Talent Acquisition & Recruitment", sort_order: 1 },
      { key: "compensation_benefits", label: "Compensation & Benefits", sort_order: 2 },
      { key: "employee_relations", label: "Employee Relations & Labor Compliance", sort_order: 3 },
      { key: "hr_generalist", label: "HR Operations & Administration", sort_order: 4 },
      { key: "training_development", label: "Training & Organizational Development", sort_order: 5 }
    ]
  },
  logistics_warehouse: {
    key: "logistics_warehouse",
    label: "Logistics & Warehouse",
    sort_order: 12,
    subcategories: [
      { key: "warehouse_inventory", label: "Warehouse & Inventory Operations", sort_order: 1 },
      { key: "forklift_material_handling", label: "Material Handling & Forklift", sort_order: 2 },
      { key: "shipping_receiving", label: "Shipping, Receiving & Dispatch", sort_order: 3 },
      { key: "supply_chain_planning", label: "Supply Chain & Procurement", sort_order: 4 },
      { key: "delivery_courier", label: "Delivery Operations & Courier", sort_order: 5 }
    ]
  },
  manufacturing: {
    key: "manufacturing",
    label: "Manufacturing",
    sort_order: 13,
    subcategories: [
      { key: "assembly_line", label: "Assembly Line Production", sort_order: 1 },
      { key: "machine_operation", label: "Machine & Equipment Operation", sort_order: 2 },
      { key: "quality_control", label: "Quality Control & Assurance", sort_order: 3 },
      { key: "production_planning", label: "Production Scheduling & Planning", sort_order: 4 },
      { key: "safety_ehs", label: "Environmental Health & Safety (EHS)", sort_order: 5 }
    ]
  },
  construction: {
    key: "construction",
    label: "Construction",
    sort_order: 14,
    subcategories: [
      { key: "site_supervision", label: "Site Supervision & Safety Inspection", sort_order: 1 },
      { key: "carpentry_masonry", label: "Carpentry, Masonry & Finishes", sort_order: 2 },
      { key: "plumbing_piping", label: "Plumbing & Piping", sort_order: 3 },
      { key: "electrical_installation", label: "Electrical Wiring & Installation", sort_order: 4 },
      { key: "heavy_equipment", label: "Heavy Equipment Operation", sort_order: 5 }
    ]
  },
  creative_design: {
    key: "creative_design",
    label: "Creative & Design",
    sort_order: 15,
    subcategories: [
      { key: "ui_ux_design", label: "UI/UX & Product Design", sort_order: 1 },
      { key: "graphic_design", label: "Graphic Design & Illustration", sort_order: 2 },
      { key: "multimedia_video", label: "Video Editing & Motion Graphics", sort_order: 3 },
      { key: "photography", label: "Photography & Videography", sort_order: 4 },
      { key: "3d_animation", label: "3D Modeling & Animation", sort_order: 5 }
    ]
  },
  security: {
    key: "security",
    label: "Security",
    sort_order: 16,
    subcategories: [
      { key: "physical_guarding", label: "Physical Security Guarding", sort_order: 1 },
      { key: "cctv_surveillance", label: "CCTV & Electronic Surveillance", sort_order: 2 },
      { key: "vip_protection", label: "VIP & Executive Protection", sort_order: 3 },
      { key: "loss_prevention", label: "Loss Prevention & Asset Safety", sort_order: 4 }
    ]
  },
  government_public_service: {
    key: "government_public_service",
    label: "Government & Public Service",
    sort_order: 17,
    subcategories: [
      { key: "public_administration", label: "Public Administration & Office Operations", sort_order: 1 },
      { key: "community_development", label: "Community & Social Work", sort_order: 2 },
      { key: "emergency_response", label: "Disaster Preparedness & Emergency Response", sort_order: 3 },
      { key: "regulatory_inspection", label: "Regulatory Compliance & Standards Inspection", sort_order: 4 }
    ]
  },
  other: {
    key: "other",
    label: "Other",
    sort_order: 18,
    subcategories: [
      { key: "general_services", label: "General Specialized Services", sort_order: 1 },
      { key: "miscellaneous_technical", label: "Miscellaneous Technical Services", sort_order: 2 }
    ]
  }
};

/**
 * Returns all 18 top-level categories sorted by sort_order
 */
export function getAllCategories() {
  return Object.values(JOB_TAXONOMY).sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Returns subcategories for a given category key
 */
export function getSubcategoriesForCategory(categoryKey) {
  if (!categoryKey || !JOB_TAXONOMY[categoryKey]) return [];
  return JOB_TAXONOMY[categoryKey].subcategories.sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Validates if category exists
 */
export function isValidCategory(categoryKey) {
  return Boolean(categoryKey && JOB_TAXONOMY[categoryKey]);
}

/**
 * Validates if subcategory exists under specified category
 */
export function isValidSubcategory(categoryKey, subcategoryKey) {
  if (!isValidCategory(categoryKey) || !subcategoryKey) return false;
  return JOB_TAXONOMY[categoryKey].subcategories.some(s => s.key === subcategoryKey);
}

/**
 * Returns display label for category
 */
export function getCategoryLabel(categoryKey) {
  return JOB_TAXONOMY[categoryKey]?.label || categoryKey || "Uncategorized";
}

/**
 * Returns display label for subcategory
 */
export function getSubcategoryLabel(categoryKey, subcategoryKey) {
  const sub = JOB_TAXONOMY[categoryKey]?.subcategories.find(s => s.key === subcategoryKey);
  return sub?.label || subcategoryKey || "";
}

/**
 * Total Counts Verification
 */
export const TAXONOMY_TOTAL_CATEGORIES = Object.keys(JOB_TAXONOMY).length; // 18
export const TAXONOMY_TOTAL_SUBCATEGORIES = Object.values(JOB_TAXONOMY).reduce(
  (acc, cat) => acc + cat.subcategories.length,
  0
); // 97
