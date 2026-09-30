/**
 * Generic Normalization Service
 * Used to normalize skills and degrees across different industries.
 */

// ── Known Legacy Multi-Word Patterns for Un-delimited String Recovery ────────
const KNOWN_LEGACY_PATTERNS = [
  'Responsive Web Design', 'Responsive Design', 'Office Administration',
  'Administrative Support', 'Email Management', 'Calendar Management',
  'Google Workspace', 'Customer Service', 'Internet Research',
  'Time Management', 'Attention to Detail', 'Problem Solving',
  'Data Entry', 'Microsoft Office', 'Microsoft Word', 'Microsoft Excel',
  'JavaScript', 'Teamwork', 'Communication', 'Organization',
  'HTML & CSS', 'Git/GitHub', 'Basic SQL',
  'HTML', 'CSS', 'Git', 'GitHub', 'SQL', 'React', 'Node.js', 'Python'
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
    "git github": "git"
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
