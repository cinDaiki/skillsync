export default {
  "version": "2.0.0",
  "fuzzyMatchThreshold": 0.88,
  "fuzzyMinLength": 7,
  "maxLevenshteinDistance": 2,
  "confidenceWeights": {
    "regex": 0.30,
    "dictionary": 0.25,
    "section": 0.20,
    "position": 0.15,
    "semantic": 0.10
  },
  "sectionDetection": {
    "maxSectionHeaderLength": 5,
    "requireAllCaps": false,
    "minAliasMatchScore": 0.85
  },
  "entityDetection": {
    "nameMaxWords": 5,
    "nameSearchLines": 8,
    "orgKeywords": ["Inc", "Ltd", "Corp", "Co.", "LLC", "Foundation",
                    "University", "College", "Institute", "School",
                    "Hospital", "Center", "Technologies", "Solutions",
                    "Services", "Group", "OPC", "Incorporated", "Association",
                    "Department", "Bureau", "Ministry", "Agency"]
  },
  "performance": {
    "targetMs": 400,
    "maxTextLength": 150000,
    "fuzzyMatchLimit": 100
  },
  "languages": ["en", "fil"],
  "features": {
    "semanticInference": true,
    "fuzzyMatching": true,
    "layoutAnalysis": true,
    "multiLanguage": true
  }
}
