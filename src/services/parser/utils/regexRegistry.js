/**
 * regexRegistry.js
 * All regex patterns compiled ONCE at module load.
 * Never use `new RegExp(...)` inside hot parsing functions.
 * Import named patterns from here instead.
 */

// ── Contact ────────────────────────────────────────────────────────────────

/** Standard email — RFC-5321 simplified */
export const EMAIL = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g

/** Philippine mobile (+63 9xx or 09xx), US, and generic international */
export const PHONE = /(?:\+63[\s\-.]?|0)(?:9\d{2})[\s\-.]?\d{3,4}[\s\-.]?\d{3,4}|(?:\+?1[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}|\+\d{1,3}[\s\-.]?\d{6,14}/gi

/** LinkedIn profile URLs */
export const LINKEDIN = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9\-_%]+\/?/gi

/** GitHub profile URLs */
export const GITHUB = /(?:https?:\/\/)?(?:www\.)?github\.com\/[a-zA-Z0-9\-_%]+\/?/gi

/** Generic URL — for portfolio detection */
export const URL_GENERIC = /https?:\/\/[^\s<>"]{4,}/gi

/** Portfolio: URL that is NOT linkedin/github */
export const PORTFOLIO = /https?:\/\/(?!.*(?:linkedin|github))[\w\-./~?=&%#:@!,;]+/gi

// ── Education ─────────────────────────────────────────────────────────────

/** GPA: "GPA: 3.75", "GPA 3.75/4.0", "GWA: 1.5", "Grade: 3.75", inline in any line */
export const GPA = /\b(?:GPA|GWA|Grade Point Average|General Average|General Weighted Average)[\s:=]*([0-9](?:[.,][0-9]{1,3}))(?:\s*\/\s*[0-9](?:[.,][0-9]{1,2}))?\b/i

/** Honors — matches bare "Cum Laude" and "Latin Honors: Magna Cum Laude" prefix format */
export const HONORS = /(?:Latin\s+Honors?\s*:\s*|Academic\s+Honors?\s*:\s*)?\b(Summa Cum Laude|Magna Cum Laude|Cum Laude|With Highest Distinction|With Distinction|With High Honors|With Honors|Dean'?s?\s*List)\b/i

/** Graduation year — 4-digit year near education keywords */
export const GRAD_YEAR = /\b(20[0-2]\d|19[89]\d)\b/g

/** Degree keywords — used to find degree lines */
export const DEGREE_KEYWORD = /\b(?:Bachelor|Master|Doctor|PhD|Ph\.D|Associate|Diploma|Certificate|BS|BA|MS|MA|MBA|BSIT|BSCS|BSCE|BSEE|BSME|BSBA|BSN|BEED|BSED|AB|BEng|BTech|LLB|JD|MD)\b/i

// ── Experience ────────────────────────────────────────────────────────────

/** Date range patterns — used to find experience/education date bounds */
export const DATE_RANGE = /(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z.]*[\s,]+)?(?:19|20)\d{2}\s*(?:–|–|-|to|until)\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z.]*[\s,]+)?(?:(?:19|20)\d{2}|[Pp]resent|[Cc]urrent|[Nn]ow|[Oo]ngoing|[Kk]asalukuyan|[Nn]gayon)/gi

/** Standalone year */
export const YEAR = /\b(20[0-2]\d|19[89]\d)\b/g

/** Employment type keywords */
export const EMPLOYMENT_TYPE = /\b(?:Full[\s-]?Time|Part[\s-]?Time|Contract|Freelance|Remote|Hybrid|On[\s-]?site|Volunteer|Internship|OJT|Practicum|Temporary|Casual)\b/gi

// ── Structural ────────────────────────────────────────────────────────────

/** Bullet characters — normalized to "- " in the normalizer */
export const BULLETS = /^[\s]*[•◆▸▪■→✔✓▶◉○●►*\-–]\s+/gm

/** Lines that look like section headers: ALL CAPS or title-case, short, no trailing punctuation */
export const SECTION_HEADER_ALLCAPS = /^[A-Z][A-Z\s&\/]{3,40}$/

/** Title case line: 1–5 words, each capitalized, ≤40 chars total, no sentence-ending punctuation */
export const SECTION_HEADER_TITLE = /^(?:[A-Z][a-zA-Z&\/]{1,20}\s?){1,5}$/

/** Detect if a line looks like a name (2-5 title-case words, no digits) */
export const NAME_LINE = /^(?:[A-Z][a-zA-Z'-]{1,20}(?:\s+[A-Z][a-zA-Z'-]{1,20}){1,4})$/

/** Detect if a line is mostly a separator */
export const SEPARATOR_LINE = /^[\s\-=_|*~.]{5,}$/

/** Horizontal whitespace gap suggesting two-column layout */
export const COLUMN_GAP = /\s{4,}/

// ── Numbers & Metrics ─────────────────────────────────────────────────────

/** Measurable achievements: percentages, large numbers, currency */
export const METRIC = /\b(?:\d+%|\$\d[\d,]*|\d+[kKmMbB]\b|\d{1,3}(?:,\d{3})+)\b/g

/** Years of experience: "5 years", "5+ years of experience" */
export const YEARS_EXP = /([1-9]|[12]\d)\+?\s*years?(?:\s*of)?(?:\s*(?:relevant|professional|work|industry))?\s*experience/i
