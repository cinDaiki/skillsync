export default {
  "version": "3.0.0",
  "sourceWeights": {
    "Skills": 50,
    "Experience": 30,
    "Projects": 20,
    "Education": 15,
    "Summary": 10,
    "Certification": 25
  },
  "matchMethods": {
    "exact": {
      "baseConfidence": 0.99,
      "weightMultiplier": 1.0
    },
    "alias": {
      "baseConfidence": 0.95,
      "weightMultiplier": 1.0
    },
    "synonym": {
      "baseConfidence": 0.90,
      "weightMultiplier": 0.95
    },
    "fuzzy": {
      "baseConfidence": 0.80,
      "weightMultiplier": 0.85
    },
    "boundary": {
      "baseConfidence": 0.92,
      "weightMultiplier": 1.0
    }
  },
  "fuzzy": {
    "enabled": true,
    "minTokenLength": 5,
    "shortTokenMinLength": 7,
    "maxLevenshteinDistance": 2,
    "jaroWinklerThreshold": 0.88,
    "maxCandidatesPerToken": 100
  },
  "confidence": {
    "maxScore": 100,
    "minReportThreshold": 15,
    "normalizeLegacyScale": true
  },
  "tokenization": {
    "delimiters": [",", ";", "|", "•", "·", "/", "\\", "(", ")", "[", "]", "{", "}", ":", "—", "–", "-"],
    "minTokenLength": 2,
    "maxNgramSize": 3
  },
  "boundaryScan": {
    "enabled": true,
    "minTermLength": 2,
    "preferLongerMatches": true
  },
  "categories": [
    "Programming Languages",
    "Frontend",
    "Backend",
    "Database",
    "Cloud",
    "DevOps",
    "AI / Machine Learning",
    "Mobile",
    "Testing",
    "Security",
    "Operating Systems",
    "Soft Skills",
    "Tools",
    "Data",
    "Healthcare",
    "Business & Finance",
    "Education",
    "Marketing",
    "Engineering",
    "HR & Admin",
    "Office"
  ],
  "stopWords": [
    "and", "to", "for", "a", "the", "of", "in", "with", "on", "at", "by", "from", "as", "an",
    "that", "this", "these", "those", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "our", "your", "their", "his", "her", "its",
    "my", "i", "we", "you", "they", "he", "she", "it", "me", "us", "him", "them",
    "who", "whom", "which", "what", "whose", "or", "but", "not", "dynamic", "scalability",
    "scalable", "building", "built", "designed", "maintain", "maintained", "developer",
    "engineer", "analyst", "manager", "specialist", "lead", "senior", "junior", "professional",
    "experience", "relevant", "hands-on", "years", "successfully", "acme", "corp", "company"
  ],
  "features": {
    "contextAwareSources": true,
    "fuzzyMatching": true,
    "boundaryScanning": true,
    "deduplication": true,
    "synonymVariants": true
  }
}
