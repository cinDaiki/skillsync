/**
 * Generic Normalization Service
 * Used to normalize skills and degrees across different industries.
 */

// ── Known Multi-Word Patterns for Un-delimited String Recovery ──────────────
const KNOWN_LEGACY_PATTERNS = [
  // Healthcare & Caregiving
  'Vital Signs Monitoring', 'Vital Signs', 'Patient Care', 'First Aid', 'Infection Control',
  'Medical Terminology', 'Medication Administration', 'Patient Assessment', 'Elderly Care',
  // Accounting & Business
  'Accounts Payable', 'Accounts Receivable', 'Financial Reporting', 'Payroll Processing',
  'Bank Reconciliation', 'Cost Accounting', 'Tax Preparation', 'Bookkeeping',
  'Office Administration', 'Administrative Support', 'Email Management', 'Calendar Management',
  'Google Workspace', 'Customer Service', 'Internet Research', 'Data Entry',
  'Microsoft Office', 'Microsoft Word', 'Microsoft Excel', 'Microsoft PowerPoint',
  // Sales & Hospitality
  'Front Desk Operations', 'Food Service', 'Guest Relations', 'Food Safety',
  'Hotel Reception', 'Concierge Services', 'Client Relations', 'Lead Generation',
  'POS Operation', 'Cash Handling', 'Call Center Operations', 'Customer Retention',
  // Trades & Engineering
  'AutoCAD', 'Technical Drawing', 'Quality Control', 'Electrical Installation',
  'Safety Procedures', 'Blueprint Reading', 'Preventive Maintenance', 'Machine Operation',
  // Education & Logistics
  'Lesson Planning', 'Classroom Management', 'Curriculum Support', 'Student Engagement',
  'Inventory Management', 'Stock Control', 'Warehouse Operations', 'Order Fulfillment', 'Forklift Operation',
  // Creative & Media
  'Graphic Design', 'Video Editing', 'Content Writing', 'Social Media Management',
  // Transferable & Soft Skills
  'Time Management', 'Attention to Detail', 'Problem Solving',
  'Teamwork', 'Communication', 'Organization', 'Leadership',
  // IT & Tech
  'Responsive Web Design', 'Responsive Design', 'JavaScript', 'TypeScript',
  'HTML & CSS', 'Git/GitHub', 'Basic SQL', 'REST APIs',
  'HTML', 'CSS', 'Git', 'GitHub', 'SQL', 'React', 'Node.js', 'Python', 'Docker'
];

/**
 * Standardizes skill names to a canonical lowercase token for exact comparison.
 * Handles common aliases, version numbers (HTML5 -> html, CSS3 -> css), and framework extensions (.js).
 */
export function normalizeSkillName(skill) {
  if (!skill) return "";
  let s = String(skill).toLowerCase().trim();

  // Strip common packaging/extension suffixes for matching
  s = s.replace(/\.js$/, "js");
  s = s.replace(/[\/\-\_\\]/g, " ");
  s = s.replace(/\s+/g, " ").trim();

  // Industry agnostic aliases & canonicalizations
  const aliases = {
    // Web / Frontend / Backend
    "html5": "html",
    "css3": "css",
    "java script": "javascript",
    "js": "javascript",
    "ts": "typescript",
    "react": "react",
    "reactjs": "react",
    "react js": "react",
    "react framework": "react",
    "node": "node",
    "nodejs": "node",
    "node js": "node",
    "vue": "vue",
    "vuejs": "vue",
    "vue js": "vue",
    "angular": "angular",
    "angularjs": "angular",
    "angular js": "angular",
    "vitejs": "vite",
    "vite js": "vite",

    // Databases / SQL
    "basic sql": "sql",
    "sql queries": "sql",
    "structured query language": "sql",

    // Design
    "responsive web design": "responsive design",
    "rwd": "responsive design",
    "mobile first design": "responsive design",

    // Office / Productivity
    "ms office": "microsoft office",
    "office suite": "microsoft office",
    "microsoft office suite": "microsoft office",
    "ms word": "microsoft word",
    "word processing": "microsoft word",
    "ms excel": "microsoft excel",
    "excel spreadsheets": "microsoft excel",
    "advanced excel": "microsoft excel",
    "excel formulas": "microsoft excel",
    "ms powerpoint": "microsoft powerpoint",
    "ms outlook": "microsoft outlook",
    "g suite": "google workspace",
    "google suite": "google workspace",

    // Git
    "git version control": "git",
    "git scm": "git",
    "git github": "git",

    // Soft Skills & Evidence
    "troubleshooting": "problem solving",
    "technical problem solving": "problem solving",
    "collaboration": "teamwork",
    "team collaboration": "teamwork",
    "team coordination": "teamwork",
    "coordinated team tasks": "teamwork",
    "team leader": "leadership",
    "team leadership": "leadership",

    // Office & Data
    "data encoding": "data entry",
    "data keying": "data entry",
    "data input": "data entry",
    "data maintenance": "data entry",
    "record encoding": "data entry",
    "encoding records": "data entry",
    "encoded records": "data entry",
    "record maintenance": "data entry",
    "maintain records": "data entry",
    "maintained records": "data entry",

    // Healthcare & Caregiving
    "vital signs": "vital signs monitoring",
    "vitals": "vital signs monitoring",
    "patient vital signs": "vital signs monitoring",
    "cpr": "first aid",
    "bls": "first aid",
    "basic life support": "first aid",
    "first aid cpr": "first aid",
    "patient assistance": "patient care",
    "bedside care": "patient care",

    // Accounting & Finance
    "ap": "accounts payable",
    "ar": "accounts receivable",
    "payroll": "payroll processing",
    "financial statements": "financial reporting",
    "financial statement preparation": "financial reporting",
    "quick books": "quickbooks",
    "bank reconciliation": "bank reconciliation",
    "tax filing": "tax preparation",

    // Sales & Customer Service
    "customer support": "customer service",
    "client support": "customer service",
    "customer assistance": "customer service",
    "pos": "pos operation",
    "point of sale": "pos operation",
    "cashiering": "cash handling",

    // Hospitality & Tourism
    "front desk": "front desk operations",
    "hotel reception": "front desk operations",
    "food and beverage": "food service",
    "f&b": "food service",
    "food preparation": "food service",
    "food sanitation": "food safety & sanitation",
    "food safety": "food safety & sanitation",

    // Engineering & Trades
    "cad": "autocad",
    "drafting": "technical drawing",
    "smaw": "welding",
    "shielded metal arc welding": "welding",
    "tig welding": "welding",
    "mig welding": "welding",
    "arc welding": "welding",
    "wiring": "electrical installation",
    "electrical wiring": "electrical installation",

    // Education
    "teaching": "lesson planning",
    "instruction": "lesson planning",
    "classroom instruction": "classroom management",

    // Logistics & Operations
    "inventory tracking": "inventory management",
    "stocking": "stock control",
    "warehouse management": "warehouse operations",
    "forklift driving": "forklift operation",

    // Creative
    "graphic designing": "graphic design",
    "visual design": "graphic design",
    "video production": "video editing"
  };

  return aliases[s] || s;
}

/**
 * Helper to split compound skill tokens into discrete skills.
 */
function decomposeToken(token) {
  const t = token.trim();
  if (!t) return [];
  if (/\bHTML\s*&\s*CSS\b/i.test(t)) {
    return ['HTML', 'CSS'];
  }
  if (/\bGit\s*\/\s*GitHub\b/i.test(t)) {
    return ['Git', 'GitHub'];
  }
  if (/\bUI\s*\/\s*UX\b/i.test(t)) {
    return ['UI/UX Design'];
  }
  if (/\bBasic\s+SQL\b/i.test(t)) {
    return ['SQL'];
  }
  return [t];
}

/**
 * Single Canonical Skill Parsing Contract
 * Converts raw database strings, user paste inputs, and structured arrays into a clean string[] of skills.
 * Preserves multi-word skills intact without uncontrolled whitespace splitting.
 *
 * @param {string|string[]|any} raw
 * @returns {string[]} Deduplicated array of discrete skill strings
 */
export function parseSkillsToArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return Array.from(new Set(
      raw.flatMap(item => {
        if (!item) return [];
        if (typeof item === 'object') {
          const val = item.canonical || item.normalized || item.name || item.title || '';
          return parseSkillsToArray(val);
        }
        return parseSkillsToArray(String(item));
      }).filter(Boolean)
    ));
  }

  if (typeof raw !== 'string') return [];

  let text = raw.trim();
  if (!text) return [];

  // Try JSON array first
  if (text.startsWith('[') && text.endsWith(']')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parseSkillsToArray(parsed);
    } catch (_) {}
  }

  // Check if original text has explicit delimiters: comma, newline, semicolon, bullet
  const hasExplicitDelimiters = /[\n\r,;•]|\s+-\s+/.test(text);

  if (hasExplicitDelimiters) {
    const rawTokens = text
      .split(/[\n\r,;•]|\s+-\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !/^[-*•]$/.test(s));

    return Array.from(new Set(rawTokens.flatMap(decomposeToken)));
  }

  // If text contains compound delimiters like " & " or "/" even without commas:
  if (/\bHTML\s*&\s*CSS\b/i.test(text) && !text.includes('Responsive Web Design')) {
    return Array.from(new Set(decomposeToken(text)));
  }

  // Legacy fallback: un-delimited space-separated string (e.g. from older Staging listings).
  // Extract known dictionary skills greedily.
  let remaining = text;
  const extracted = [];

  for (const pattern of KNOWN_LEGACY_PATTERNS) {
    const regex = new RegExp(`\\b${pattern.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'gi');
    if (regex.test(remaining)) {
      if (pattern === 'HTML & CSS') {
        extracted.push('HTML', 'CSS');
      } else if (pattern === 'Git/GitHub') {
        extracted.push('Git', 'GitHub');
      } else if (pattern === 'Basic SQL') {
        extracted.push('SQL');
      } else {
        extracted.push(pattern);
      }
      remaining = remaining.replace(regex, ' ');
    }
  }

  // If dictionary patterns were found, return them plus any remaining significant tokens
  if (extracted.length > 0) {
    const remainingTokens = remaining.split(/\s+/).map(s => s.trim()).filter(s => s.length > 2);
    return Array.from(new Set([...extracted, ...remainingTokens])).filter(Boolean);
  }

  // Single discrete skill without delimiters (e.g. "React" or "Responsive Web Design")
  return [text];
}

export function normalizeDegree(degree) {
  if (!degree) return "";
  let d = String(degree).toLowerCase().trim();
  d = d.replace(/[\.\,]/g, ""); // Remove periods (e.g., B.S. -> BS)

  const degreeMap = {
    "bs": "bachelor of science",
    "ba": "bachelor of arts",
    "bsc": "bachelor of science",
    "bba": "bachelor of business administration",
    "bsit": "bachelor of science in information technology",
    "bscs": "bachelor of science in computer science",
    "bsa": "bachelor of science in accountancy",
    "bsn": "bachelor of science in nursing",
    "beed": "bachelor of elementary education",
    "bsed": "bachelor of secondary education",
    "bshm": "bachelor of science in hospitality management",
    "bsce": "bachelor of science in civil engineering",
    "bsee": "bachelor of science in electrical engineering",
    "bsme": "bachelor of science in mechanical engineering",
    "ms": "master of science",
    "ma": "master of arts",
    "mba": "master of business administration",
    "phd": "doctor of philosophy",
    "md": "doctor of medicine",
    "jd": "juris doctor"
  };

  // Direct mapping
  if (degreeMap[d]) return degreeMap[d];

  // Try to find if the acronym is part of a mapped degree (e.g. "bs in computer science")
  const parts = d.split(" ");
  if (parts.length > 0 && degreeMap[parts[0]]) {
    const expanded = degreeMap[parts[0]];
    const remainder = parts.slice(1).join(" ");
    return `${expanded} ${remainder}`.trim();
  }

  return d;
}
