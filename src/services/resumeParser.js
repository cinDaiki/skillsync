import { normalizeSkillName } from "./normalization";
import { runPipeline } from "./parser/index.js";

/**
 * LARGE curated skill dictionary spanning ALL industries.
 * Used for accurate keyword matching across any resume type.
 */
const SKILL_DICTIONARY = [
  // ── IT & Software ──
  "JavaScript", "TypeScript", "Python", "Java", "C#", "C++", "C", "PHP", "Ruby", "Go",
  "Rust", "Kotlin", "Swift", "Dart", "Scala", "R", "MATLAB", "Perl", "Bash", "Shell",
  "React", "React.js", "ReactJS", "Vue", "Vue.js", "Angular", "Next.js", "Nuxt.js",
  "Node.js", "Express", "Django", "Flask", "FastAPI", "Spring Boot", "Laravel", "Rails",
  "HTML", "CSS", "Sass", "SCSS", "Tailwind CSS", "Bootstrap", "Material UI",
  "MySQL", "PostgreSQL", "MongoDB", "SQLite", "Redis", "Firebase", "Supabase",
  "GraphQL", "REST API", "REST APIs", "WebSocket", "gRPC",
  "AWS", "Azure", "Google Cloud", "Docker", "Kubernetes", "Terraform", "Jenkins",
  "Git", "GitHub", "GitLab", "Bitbucket", "CI/CD", "Linux", "Nginx", "Apache",
  "Machine Learning", "Deep Learning", "NLP", "TensorFlow", "PyTorch", "scikit-learn",
  "Data Analysis", "Data Science", "Power BI", "Tableau", "Excel", "SQL",
  "Figma", "Adobe XD", "Sketch", "Photoshop", "Illustrator", "UI/UX Design",
  "Agile", "Scrum", "Kanban", "Jira", "Trello", "Confluence",

  // ── Accounting & Finance ──
  "Bookkeeping", "Financial Reporting", "Tax Preparation", "Auditing", "Payroll",
  "QuickBooks", "SAP", "Oracle Financials", "Xero", "MYOB",
  "Accounts Payable", "Accounts Receivable", "General Ledger", "Bank Reconciliation",
  "Financial Analysis", "Budgeting", "Forecasting", "Cost Accounting", "Managerial Accounting",
  "GAAP", "IFRS", "Internal Audit", "External Audit", "Taxation", "VAT", "BIR Compliance",
  "Financial Statements", "Balance Sheet", "Income Statement", "Cash Flow",

  // ── Healthcare & Nursing ──
  "Patient Care", "Nursing", "Clinical Assessment", "Medication Administration",
  "Electronic Health Records", "EHR", "EMR", "IV Therapy", "Wound Care", "Phlebotomy",
  "CPR", "BLS", "ACLS", "Vital Signs", "Triage", "ICU", "Emergency Care", "Pediatrics",
  "Medical Coding", "ICD-10", "CPT Coding", "Health Information Management",
  "HIPAA", "Patient Safety", "Infection Control", "Pharmacology",

  // ── Engineering ──
  "AutoCAD", "SolidWorks", "CATIA", "Revit", "Civil Engineering", "Structural Engineering",
  "Mechanical Engineering", "Electrical Engineering", "PLC Programming", "SCADA",
  "Project Management", "Blueprints", "Technical Drawing", "Construction Management",
  "Quality Control", "QA Testing", "ISO Standards", "Lean Manufacturing", "Six Sigma",

  // ── Education ──
  "Curriculum Development", "Lesson Planning", "Classroom Management", "E-Learning",
  "Educational Technology", "Student Assessment", "Differentiated Instruction",
  "Special Education", "Tutoring", "Training and Development",

  // ── Customer Service & Sales ──
  "Customer Service", "Customer Support", "CRM", "Salesforce", "HubSpot",
  "Call Center", "Technical Support", "Help Desk", "Ticketing Systems", "Zendesk",
  "Sales", "Cold Calling", "Lead Generation", "Account Management", "Negotiation",
  "Client Relations", "Conflict Resolution",

  // ── Marketing & Media ──
  "Digital Marketing", "Social Media Marketing", "SEO", "SEM", "Google Ads",
  "Facebook Ads", "Content Marketing", "Email Marketing", "Copywriting", "Blogging",
  "Brand Management", "Market Research", "Google Analytics", "Adobe Premiere",
  "Video Editing", "Photography", "Canva", "After Effects",

  // ── Legal ──
  "Legal Research", "Contract Drafting", "Contract Law", "Corporate Law",
  "Litigation", "Legal Writing", "Case Management", "Compliance", "Paralegal",

  // ── HR & Admin ──
  "Recruitment", "Talent Acquisition", "Onboarding", "Performance Management",
  "Employee Relations", "HRIS", "Workday", "BambooHR", "Payroll Processing",
  "Labor Law", "Compensation and Benefits",

  // ── Logistics & Supply Chain ──
  "Supply Chain Management", "Inventory Management", "Logistics", "Warehouse Management",
  "Procurement", "Vendor Management", "Import", "Export", "Customs Clearance",
  "SAP MM", "SAP WM", "ERP",

  // ── Universal Professional Skills ──
  "Communication", "Leadership", "Problem Solving", "Critical Thinking", "Teamwork",
  "Time Management", "Adaptability", "Analytical Skills", "Attention to Detail",
  "Microsoft Office", "Microsoft Word", "Microsoft Excel", "Microsoft PowerPoint",
  "Presentation Skills", "Report Writing", "Research",
];

// ─── Text extractors ───────────────────────────────────────────────────────────

/**
 * Extract readable text from a DOCX file.
 * DOCX = ZIP archive → unzip → find word/document.xml → strip XML tags.
 */
async function extractTextFromDocx(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuffer);

    // Check DOCX magic bytes (PK ZIP header: 0x50 0x4B)
    if (uint8[0] !== 0x50 || uint8[1] !== 0x4B) {
      return extractTextFallback(arrayBuffer);
    }

    const blob = new Blob([arrayBuffer], { type: "application/zip" });
    const rawString = new TextDecoder("utf-8", { fatal: false }).decode(uint8);

    // Find the document.xml content — DOCX stores content in <w:t> tags
    const wTextRegex = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/gi;
    const texts = [];
    let match;
    while ((match = wTextRegex.exec(rawString)) !== null) {
      const t = match[1].trim();
      if (t.length > 0) texts.push(t);
    }

    if (texts.length > 10) {
      return texts.join(" ");
    }

    return extractReadableAscii(rawString);
  } catch {
    return "";
  }
}

/**
 * Fallback: extract sequences of printable ASCII characters (≥5 chars) from binary.
 */
function extractReadableAscii(rawText) {
  const chunks = rawText.match(/[\x20-\x7E]{4,}/g) || [];
  return chunks
    .filter(s => /[a-zA-Z]{2,}/.test(s))
    .join(" ");
}

/**
 * Fallback for non-ZIP binary content.
 */
function extractTextFallback(arrayBuffer) {
  const raw = new TextDecoder("utf-8", { fatal: false }).decode(arrayBuffer);
  return extractReadableAscii(raw);
}

/**
 * Extract text from a PDF or plain text file.
 */
function extractTextFromPdfOrTxt(rawText) {
  return rawText
    .replace(/[^\x20-\x7E\n\r\t]/g, " ")
    .replace(/\s{3,}/g, " ")
    .trim();
}

// ─── Skill Extraction (legacy — kept for fallback) ────────────────────────────

/**
 * Match skills against the legacy dictionary using whole-word regex.
 */
function extractSkills(text) {
  const detectedSkills = new Set();

  SKILL_DICTIONARY.forEach((skill) => {
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let regex;
    if (skill.length <= 2) {
      regex = new RegExp(`(?:^|[\\s,;/|\\(\\)])${escaped}(?:[\\s,;/|\\(\\)]|$)`, "i");
    } else {
      regex = new RegExp(`(?<![a-zA-Z])${escaped}(?![a-zA-Z])`, "i");
    }
    if (regex.test(text)) {
      detectedSkills.add(skill);
    }
  });

  return detectedSkills;
}

// ─── Main Parser (Adapter) ────────────────────────────────────────────────────

/**
 * Parse a resume file.
 * Phase 1: calls new runPipeline() for enhanced skill recognition + contact validation.
 * Falls back gracefully to legacy extraction if pipeline fails.
 * Preserves 100% backward-compatible return shape.
 */
export async function parseResumeFile(file) {
  const fileName = file.name.toLowerCase();
  const isDocx = fileName.endsWith(".docx");
  const isDoc  = fileName.endsWith(".doc");
  const isPdf  = fileName.endsWith(".pdf");

  // ── Step 1: Extract text ──────────────────────────────────────────────────
  let text = "";
  if (isDocx || isDoc) {
    text = await extractTextFromDocx(file);
  } else {
    const rawText = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve((e.target?.result || "").toString());
      reader.onerror = () => resolve("");
      reader.readAsText(file.slice(0, 150000), "UTF-8");
    });
    text = extractTextFromPdfOrTxt(rawText);
  }

  // ── Step 2: Run new pipeline (Phase 1: skills + contact) ─────────────────
  let pipelineResult = null;
  try {
    pipelineResult = await runPipeline({
      rawText:  text,
      fileType: isPdf ? "pdf" : isDocx ? "docx" : "txt",
    });
  } catch (pipelineErr) {
    // Pipeline failure must NEVER break the existing UI — fall through to legacy
    console.warn("[Parser v2] Pipeline error, falling back to legacy:", pipelineErr);
  }

  // ── Step 3: Legacy fallbacks (for fields not yet in pipeline) ────────────
  const emailMatch    = text.match(/[\w.-]+@[\w.-]+\.\w{2,}/i);
  const phoneMatch    = text.match(/(\+?\d{1,4}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  const linkedinMatch = text.match(/linkedin\.com\/in\/[\w.-]+/i);
  const githubMatch   = text.match(/github\.com\/[\w.-]+/i);

  const degreePatterns = [
    /\b(bachelor['\s]s?\s+(?:of\s+)?(?:science|arts|engineering|business|education|technology|nursing|commerce|fine\s+arts)[^,\n]{0,60})/i,
    /\b(master['\s]s?\s+(?:of\s+)?(?:science|arts|engineering|business|public\s+administration|education)[^,\n]{0,60})/i,
    /\b(doctor(?:ate)?\s+of\s+(?:philosophy|medicine|pharmacy)[^,\n]{0,60})/i,
    /\b(associate['\s]s?\s+(?:of\s+)?(?:science|arts|applied\s+science)[^,\n]{0,50})/i,
    /\b(BS(?:IT|CS|A|N|Ed|CE|EE|ME|BA|Accountancy|Nursing|Education|CS|Engineering)?(?:\s+in\s+[A-Za-z\s]{3,40})?)\b/i,
    /\b(B\.S\.|B\.A\.|M\.S\.|M\.A\.|Ph\.D|MBA)\b/i,
    /\b(Bachelor|Master|PhD|Ph\.D|Doctorate|Associate|Diploma|Certificate)\b/i,
  ];
  let extractedDegree = null;
  for (const pat of degreePatterns) {
    const m = text.match(pat);
    if (m && m[1]) { extractedDegree = m[1].replace(/\s+/g, " ").trim(); break; }
  }

  let extractedCourse = null;
  const courseMatch = text.match(/(?:Bachelor|Master|BS|B\.S\.|BA|B\.A\.)\s+(?:of|in)\s+([A-Z][a-zA-Z\s]{2,40}?)(?=[,\n]|$)/);
  if (courseMatch) extractedCourse = courseMatch[1].trim();
  if (!extractedCourse) {
    const majorMatch = text.match(/(?:major(?:ing)?\s+in|course\s*[:\u2013-]?)\s+([A-Z][a-zA-Z\s]{2,35}?)(?=[,\n\.])/i);
    if (majorMatch) extractedCourse = majorMatch[1].trim();
  }

  const yearsMatch = text.match(/([1-9]|[12]\d)\+?\s*years?(?:\s*of)?\s*(?:relevant\s+)?(?:professional\s+)?experience/i);
  const extractedYearsOfExperience = yearsMatch ? parseInt(yearsMatch[1], 10) : 0;

  const hasExperienceSection = /work\s*experience|professional\s*experience|employment|work\s*history|career\s*(history|summary)|experience|internship|ojt|practicum|karanasan/i.test(text);
  const hasEducationSection  = /education|university|college|school|degree|bachelor|master|doctorate|diploma|graduate|bsit|bscs|course|edukasyon|pinag-aralan/i.test(text);
  const hasCertificationsSection = /certif|license|credential|training|seminar|award|nc\s*ii|tesda|prc|sertipiko/i.test(text);
  const hasContact = !!(emailMatch || phoneMatch || /linkedin|github|portfolio/i.test(text));
  const isComplexFormat = isDocx || isDoc || isPdf;

  // ── Step 4: Prefer pipeline contact over legacy regex ────────────────────
  const pContact = pipelineResult?.contact;
  const parsedDetails = {
    email:    pContact?.email?.normalized    || emailMatch?.[0]    || null,
    phone:    pContact?.phone?.normalized    || phoneMatch?.[0]    || null,
    linkedin: pContact?.linkedin?.normalized || (linkedinMatch ? "https://" + linkedinMatch[0] : null),
    github:   pContact?.github?.normalized   || (githubMatch   ? "https://" + githubMatch[0]   : null),
    hasExperienceSection:     hasExperienceSection || isComplexFormat,
    hasEducationSection:      hasEducationSection  || isComplexFormat,
    hasCertificationsSection: hasCertificationsSection,
    hasContact:               hasContact,
    degree:   extractedDegree,
    course:   extractedCourse,
    yearsOfExperience: extractedYearsOfExperience,
  };

  // ── Step 5: Merge pipeline skills + legacy skills ─────────────────────────
  const pipelineSkillNames = pipelineResult?.skills?.map(s => s.normalized) || [];
  const legacySkills       = Array.from(extractSkills(text));
  const pipelineSet        = new Set(pipelineSkillNames.map(s => s.toLowerCase()));
  const mergedSkills = [
    ...pipelineSkillNames,
    ...legacySkills.filter(s => !pipelineSet.has(s.toLowerCase())),
  ];

  // ── Step 6: Legacy scoring ────────────────────────────────────────────────
  const skillCount = mergedSkills.length;
  let score = 20;
  if (isPdf) score += 10; else score += 5;
  if (parsedDetails.email)   score += 10;
  if (parsedDetails.phone)   score += 10;
  if (parsedDetails.linkedin || parsedDetails.github) score += 5;
  if (parsedDetails.hasExperienceSection)     score += 15;
  if (parsedDetails.hasEducationSection)      score += 15;
  if (parsedDetails.hasCertificationsSection) score += 10;
  if (skillCount > 10) score += 15;
  else if (skillCount > 5) score += 10;
  else if (skillCount > 1) score += 5;
  score = Math.min(100, score);

  let completeness = 20;
  if (parsedDetails.email || parsedDetails.phone) completeness += 20;
  if (skillCount > 0)                       completeness += 20;
  if (parsedDetails.hasExperienceSection)   completeness += 20;
  if (parsedDetails.hasEducationSection)    completeness += 20;

  // ── Step 7: Return legacy shape + new `parsed` field (additive) ──────────
  return {
    // ─ Legacy fields — 100% backward compatible ─
    score:        Math.round(score),
    completeness: Math.round(completeness),
    skills:       mergedSkills,
    details:      parsedDetails,
    extractedText: text,   // used by embeddingService for semantic encoding
    // ─ New fields — existing callers safely ignore these ─
    parsed:       pipelineResult,
  };
}

/**
 * Generates suggested skills based on a job title and description.
 * Used by the recruiter PostJob page — unchanged.
 */
export async function generateSuggestedSkills(jobTitle, description) {
  await new Promise((r) => setTimeout(r, 400));
  const text = (jobTitle + " " + description).toLowerCase();
  const suggested = new Set();
  SKILL_DICTIONARY.forEach((skill) => {
    if (text.includes(skill.toLowerCase())) suggested.add(skill);
  });
  return Array.from(suggested).slice(0, 10);
}
