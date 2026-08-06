/**
 * Generic Normalization Service
 * Used to normalize skills and degrees across different industries.
 */

export function normalizeSkillName(skill) {
  if (!skill) return "";
  let s = String(skill).toLowerCase().trim();
  
  // Standardize common symbols
  s = s.replace(/\.js$/, "js");
  s = s.replace(/[\/\-\_\\]/g, " "); // Replace slashes, dashes, underscores with space
  
  // Condense multiple spaces
  s = s.replace(/\s+/g, " ");

  // Industry agnostic aliases (can be expanded later if needed)
  const aliases = {
    "ms office": "microsoft office",
    "java script": "javascript",
    "react js": "reactjs",
    "node js": "nodejs",
    "vue js": "vuejs",
    "angular js": "angularjs"
  };

  return aliases[s] || s;
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
