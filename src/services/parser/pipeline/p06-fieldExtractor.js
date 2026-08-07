/**
 * p06-fieldExtractor.js
 * Extracts structured fields from the document graph.
 *
 * Produces:
 *   ctx.contact        � validated contact fields
 *   ctx.education      � array of education entries
 *   ctx.experience     � array of experience entries (chronologically sorted)
 *   ctx.projects       � array of project entries
 *   ctx.certifications � array of certification entries
 *   ctx.summary        � profile summary text
 */

import {
  EMAIL, PHONE, LINKEDIN, GITHUB, URL_GENERIC,
  DEGREE_KEYWORD, GPA, HONORS, DATE_RANGE, YEAR, EMPLOYMENT_TYPE,
} from '../utils/regexRegistry.js'
import { parseDateRange, formatDate, calcDuration } from '../utils/dateParser.js'
import {
  validateEmail, validatePhone, validateLinkedIn,
  validateGitHub, validatePortfolio,
} from '../utils/contactValidator.js'
import { DEGREE_MAP } from '../config/configLoader.js'

// ?? Degree normalization ??????????????????????????????????????????????????????
const DEGREE_MAP_LOWER = new Map(
  Object.entries(DEGREE_MAP).map(([k, v]) => [k.toLowerCase().trim(), v])
)

function normalizeDegree(raw) {
  if (!raw) return null
  const t = raw.trim()

  // Direct map lookup
  const direct = DEGREE_MAP_LOWER.get(t.toLowerCase())
  if (direct) return direct

  // Partial prefix match (e.g. "BSIT Major in Web Development")
  for (const [abbr, full] of DEGREE_MAP_LOWER) {
    if (t.toLowerCase().startsWith(abbr) && t.length - abbr.length <= 40) {
      const suffix = t.slice(abbr.length).trim()
      return suffix ? `${full} - ${suffix}` : full
    }
  }

  return t  // return as-is if no match
}

// ?? Employment type detection ?????????????????????????????????????????????????
function detectEmploymentType(lines) {
  const text = lines.join(' ').toLowerCase()
  if (/\b(ojt|intern|practicum|on-the-job)\b/.test(text))   return 'INTERNSHIP'
  if (/\bfreelance\b/.test(text))                            return 'FREELANCE'
  if (/\bvolunteer\b/.test(text))                            return 'VOLUNTEER'
  if (/\bpart.?time\b/.test(text))                           return 'PART_TIME'
  if (/\bcontract\b/.test(text))                             return 'CONTRACT'
  return 'FULL_TIME'
}

// ?? Field value wrapper ???????????????????????????????????????????????????????
function field(raw, normalized, confidence, method, reason, matchedPattern = null) {
  return { raw, normalized, confidence, method, reason, matchedPattern }
}

function missing(reason) {
  return { raw: null, normalized: null, confidence: 0, method: null, reason }
}

// ?? Contact extraction ????????????????????????????????????????????????????????
function extractContactFromLines(lines) {
  const text = lines.join('\n')

  // Reset global regex lastIndex
  const resetRe = re => { re.lastIndex = 0; return re }

  const emails    = text.match(resetRe(EMAIL))    || []
  const phones    = text.match(resetRe(PHONE))    || []
  const linkedins = text.match(resetRe(LINKEDIN)) || []
  const githubs   = text.match(resetRe(GITHUB))   || []

  const rawEmail    = emails[0]    || null
  const rawPhone    = phones[0]    || null
  const rawLinkedIn = linkedins[0] || null
  const rawGitHub   = githubs[0]   || null

  // Portfolio: any URL that's not linkedin/github
  URL_GENERIC.lastIndex = 0
  const allUrls     = text.match(URL_GENERIC) || []
  const portfolioUrl = allUrls.find(u =>
    !/linkedin\.com|github\.com/i.test(u) && u.startsWith('http')
  ) || null

  const eV  = validateEmail(rawEmail)
  const pV  = validatePhone(rawPhone)
  const lV  = validateLinkedIn(rawLinkedIn)
  const gV  = validateGitHub(rawGitHub)
  const poV = validatePortfolio(portfolioUrl)

  return {
    email:    eV.valid
      ? field(rawEmail, rawEmail, 0.97, 'regex', 'Found via email pattern in contact block', EMAIL.source)
      : missing(eV.reason || 'No valid email found'),
    phone:    pV.valid
      ? field(rawPhone, pV.normalized, 0.95, 'regex', 'Found via phone pattern', PHONE.source)
      : missing(pV.reason || 'No valid phone found'),
    linkedin: lV.valid
      ? field(rawLinkedIn, lV.normalized, 0.99, 'regex', 'Found LinkedIn URL', 'linkedin.com/in/*')
      : missing(lV.reason || 'No LinkedIn URL found'),
    github:   gV.valid
      ? field(rawGitHub, gV.normalized, 0.99, 'regex', 'Found GitHub URL', 'github.com/*')
      : missing(gV.reason || 'No GitHub URL found'),
    portfolio: poV.valid
      ? field(portfolioUrl, poV.normalized, 0.90, 'regex', 'Found portfolio URL')
      : missing('No portfolio URL found'),
  }
}

// ?? Education extraction ??????????????????????????????????????????????????????
function extractEducationEntry(entry) {
  const text = lines => lines.join(' ')
  const t    = text(entry.lines)

  // Degree
  DEGREE_KEYWORD.lastIndex = 0
  const degreeMatch = t.match(DEGREE_KEYWORD)
  const rawDegree   = degreeMatch
    ? entry.lines.find(l => DEGREE_KEYWORD.test(l.replace(DEGREE_KEYWORD.source, m => { DEGREE_KEYWORD.lastIndex = 0; return m })))
    : null
  DEGREE_KEYWORD.lastIndex = 0

  // Find the full degree line (may include major)
  const degreeLine = entry.lines.find(l => {
    DEGREE_KEYWORD.lastIndex = 0
    const m = DEGREE_KEYWORD.test(l)
    DEGREE_KEYWORD.lastIndex = 0
    return m
  }) || null

  const rawDegreeVal = degreeLine
  const normalizedDeg = rawDegreeVal ? normalizeDegree(rawDegreeVal) : null

  // Graduation year
  const yearMatches = t.match(YEAR) || []
  const gradYear    = yearMatches.find(y => parseInt(y) >= 1990 && parseInt(y) <= 2035) || null

  // GPA
  GPA.lastIndex = 0
  const gpaMatch = t.match(GPA)
  GPA.lastIndex  = 0
  const gpa      = gpaMatch ? gpaMatch[1] : null

  // Honors
  HONORS.lastIndex = 0
  const honorsMatch = t.match(HONORS)
  HONORS.lastIndex  = 0
  const honors      = honorsMatch ? honorsMatch[1] : null

  // Institution: line that's NOT the degree line, looks like a proper noun, in upper area
  const institution = entry.lines.find(l => {
    DEGREE_KEYWORD.lastIndex = 0
    const isDegLine = DEGREE_KEYWORD.test(l)
    DEGREE_KEYWORD.lastIndex = 0
    return !isDegLine &&
      l.trim().length > 5 &&
      /[A-Z]/.test(l[0]) &&
      !/^\d/.test(l.trim()) &&
      !/^[-�]/.test(l.trim()) &&
      !YEAR.test(l)
  }) || null

  return {
    degree:      rawDegreeVal
      ? field(rawDegreeVal, normalizedDeg, 0.90, 'regex+degreeMap', 'Matched degree keyword in education section', DEGREE_KEYWORD.source)
      : missing('No degree pattern found in entry'),
    institution: institution
      ? field(institution, institution, 0.78, 'heuristic', 'Proper-noun line near degree in education section')
      : missing('No institution line found'),
    graduation:  gradYear
      ? field(gradYear, gradYear, 0.88, 'regex', 'Year extracted from education entry', YEAR.source)
      : missing('No graduation year found'),
    gpa: gpa
      ? field(gpa, gpa, 0.88, 'regex', 'GPA pattern matched', GPA.source)
      : missing('No GPA found'),
    honors: honors
      ? field(honors, honors, 0.92, 'regex', 'Academic honors detected', HONORS.source)
      : missing('No honors mentioned'),
  }
}

// Experience extraction
function extractExperienceEntry(entry) {
  const { lines } = entry

  let dr = entry.dateRange || null
  let isCurrent = entry.isCurrent || dr?.end?.isCurrent || false

  if (!dr) {
    for (const line of lines) {
      DATE_RANGE.lastIndex = 0
      const match = line.match(DATE_RANGE)
      DATE_RANGE.lastIndex = 0
      if (match) {
        dr = parseDateRange(match[0])
        if (dr) {
          isCurrent = dr.end?.isCurrent ?? false
          break
        }
      }
    }
  }

  const startStr = dr?.start ? formatDate(dr.start) : null
  const endStr = dr?.end
    ? (dr.end.isCurrent ? 'Present' : formatDate(dr.end))
    : null
  const duration = dr?.start
    ? calcDuration(dr.start, dr.end || { ...dr.start, isCurrent: true })
    : null

  const isMetaLine = l =>
    /monthly salary|salary grade|salary\s*:/i.test(l) ||
    /inclusive dates:/i.test(l) ||
    /^sg[-\s]\d+/i.test(l.trim())

  const titleLine = lines.find(l => {
    DATE_RANGE.lastIndex = 0
    const hasDate = DATE_RANGE.test(l)
    DATE_RANGE.lastIndex = 0
    return !hasDate && !l.startsWith('-') && !isMetaLine(l) &&
      l.trim().length > 3 && l.trim().length < 80
  }) || null

  let effectiveTitleLine = titleLine
  if (titleLine) {
    const govPos = titleLine.match(/^Position\s*:\s*(.+)$/i)
    if (govPos) effectiveTitleLine = govPos[1].trim()
  }

  const titleIdx = titleLine ? lines.indexOf(titleLine) : -1
  const companyLine = titleIdx >= 0
    ? lines.slice(titleIdx + 1).find(l => {
        DATE_RANGE.lastIndex = 0
        const hasDate = DATE_RANGE.test(l)
        DATE_RANGE.lastIndex = 0
        return !hasDate && !l.startsWith('-') && !isMetaLine(l) && l.trim().length > 3
      })
    : null

  let effectiveCompanyLine = companyLine
  if (companyLine) {
    const govOffice = companyLine.match(/^Office\s*:\s*(.+)$/i)
    if (govOffice) effectiveCompanyLine = govOffice[1].trim()
  }

  const responsibilities = lines
    .filter(l => l.trim().startsWith('-'))
    .map(l => l.trim().slice(2).trim())
    .filter(Boolean)

  const empType = detectEmploymentType(lines)

  return {
    title: effectiveTitleLine
      ? field(titleLine, effectiveTitleLine, 0.82, 'heuristic', 'First non-date non-meta line in experience entry')
      : missing('No title line detected'),
    company: effectiveCompanyLine
      ? field(companyLine, effectiveCompanyLine, 0.78, 'heuristic', 'Second non-date line taken as company name')
      : missing('No company line detected'),
    type: field(null, empType, 0.70, 'keyword', 'Employment type inferred from keywords in entry'),
    start: startStr
      ? field(startStr, dr.start, 0.92, 'regex', 'Start date extracted from date range', DATE_RANGE.source)
      : missing('No start date found'),
    end: endStr
      ? field(endStr, dr.end, dr.end?.isCurrent ? 0.99 : 0.92, 'regex', endStr === 'Present' ? 'Current/Present keyword detected' : 'End date extracted from date range')
      : missing('No end date found'),
    isCurrent: isCurrent || dr?.end?.isCurrent || false,
    duration: duration ? field(duration, duration, 0.90, 'calculated', 'Duration computed from start and end dates') : missing('Cannot compute duration'),
    responsibilities,
  }
}

// Project extraction
function extractProjectEntry(entry) {
  const { lines } = entry
  const text = lines.join(' ')

  // Name: first non-bullet line
  const nameLine = lines.find(l => !l.startsWith('-') && l.trim().length > 2) || null

  // Links
  GITHUB.lastIndex = 0
  const githubMatch = text.match(GITHUB)
  GITHUB.lastIndex  = 0

  URL_GENERIC.lastIndex = 0
  const allUrls   = text.match(URL_GENERIC) || []
  URL_GENERIC.lastIndex = 0
  const demoUrl   = allUrls.find(u => !/github\.com/i.test(u)) || null

  // Description: non-bullet lines after name
  const nameIdx    = nameLine ? lines.indexOf(nameLine) : 0
  const description = lines
    .slice(nameIdx + 1)
    .filter(l => !l.startsWith('-'))
    .join(' ')
    .trim()

  // Tech stack will be extracted in Phase 3 by skill recognizer

  return {
    name:        nameLine  ? field(nameLine, nameLine, 0.83, 'heuristic', 'First non-bullet line in project entry')         : missing('No project name found'),
    description: description ? field(description, description, 0.80, 'heuristic', 'Non-bullet lines after name')            : missing('No description found'),
    githubLink:  githubMatch  ? field(githubMatch[0], 'https://' + githubMatch[0].replace(/^https?:\/\//, ''), 0.99, 'regex', 'GitHub URL found in project') : missing('No GitHub link in project'),
    liveDemo:    demoUrl   ? field(demoUrl, demoUrl, 0.88, 'regex', 'Non-GitHub URL in project')                            : missing('No live demo URL'),
    techStack:   [],  // populated in Phase 3 by skill recognizer
    responsibilities: lines.filter(l => l.startsWith('-')).map(l => l.slice(1).trim()),
  }
}

// ?? Certification extraction ??????????????????????????????????????????????????
function extractCertificationEntry(entry) {
  const { lines } = entry
  const text = lines.join(' ')

  const nameLine = lines.find(l => !l.startsWith('-') && l.trim().length > 2) || null

  // Year
  YEAR.lastIndex = 0
  const yearMatch = text.match(YEAR)
  YEAR.lastIndex  = 0

  // Issuer: "by X", "from X", "issued by X"
  const issuerMatch = text.match(/(?:by|from|issued by|�|:)\s+([A-Z][a-zA-Z\s&.,']{2,40})/i)

  return {
    name:   nameLine    ? field(nameLine, nameLine, 0.83, 'heuristic', 'First line in certification entry')               : missing('No name found'),
    issuer: issuerMatch ? field(issuerMatch[1], issuerMatch[1], 0.78, 'regex', 'Issuer extracted from preposition pattern') : missing('No issuer found'),
    date:   yearMatch   ? field(yearMatch[0], yearMatch[0], 0.85, 'regex', 'Year extracted from certification entry')       : missing('No date found'),
  }
}

// ?? Main stage ????????????????????????????????????????????????????????????????

/**
 * @param {object} ctx
 * @param {object} ctx.graph
 * @returns {object} ctx with education, experience, projects, certifications
 */
export function extractFields(ctx) {
  const { graph, sections } = ctx

  if (!graph) return { ...ctx, contact: {}, education: [], experience: [], projects: [], certifications: [], summary: null }

  // Contact � from header + CONTACT section
  const contactLines = [
    ...(graph.header?.lines || []),
    ...(sections?.get('CONTACT')?.lines || []),
  ]
  const contact = extractContactFromLines(contactLines)

  // Summary
  const summarySection = graph.sections.find(s => s.type === 'SUMMARY')
  const summary = summarySection?.lines?.join(' ').trim() || null

  // Education
  const eduSection = graph.sections.find(s => s.type === 'EDUCATION')
  const education  = (eduSection?.entries || []).map(extractEducationEntry)

  // Experience
  const expSection = graph.sections.find(s => s.type === 'EXPERIENCE')
  const experience = (expSection?.entries || [])
    .map(extractExperienceEntry)
    .sort((a, b) => {
      // Sort: current first, then by start year descending
      if (a.isCurrent && !b.isCurrent) return -1
      if (!a.isCurrent && b.isCurrent) return 1
      const ay = a.start?.normalized?.year || 0
      const by = b.start?.normalized?.year || 0
      return by - ay
    })

  // Projects
  const projSection = graph.sections.find(s => s.type === 'PROJECTS')
  const projects    = (projSection?.entries || []).map(extractProjectEntry)

  // Certifications
  const certSection    = graph.sections.find(s => s.type === 'CERTIFICATIONS')
  const certifications = (certSection?.entries || []).map(extractCertificationEntry)

  // Calculate total years of experience
  let totalExpYears = 0
  experience.forEach(exp => {
    if (exp.start?.normalized?.year) {
      const startY = exp.start.normalized.year
      const endY   = exp.isCurrent ? new Date().getFullYear() : (exp.end?.normalized?.year || startY)
      totalExpYears += Math.max(0, endY - startY)
    }
  })

  return {
    ...ctx,
    contact,
    summary,
    education,
    experience,
    projects,
    certifications,
    totalExpYears: Math.round(totalExpYears * 10) / 10,
  }
}
