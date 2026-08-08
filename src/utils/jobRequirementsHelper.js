/**
 * Standard Application Requirement Presets
 */
export const PRESET_REQUIREMENTS = [
  { id: "resume", name: "Resume / CV", icon: "📄", defaultSelected: true },
  { id: "tor", name: "Transcript of Records (TOR)", icon: "📜", defaultSelected: false },
  { id: "diploma", name: "Diploma", icon: "🎓", defaultSelected: false },
  { id: "valid_id", name: "Valid Government ID", icon: "🪪", defaultSelected: true },
  { id: "coe", name: "Certificate of Employment", icon: "💼", defaultSelected: false },
  { id: "training_cert", name: "Training Certificate", icon: "🎖️", defaultSelected: false },
  { id: "license", name: "Professional License", icon: "⚕️", defaultSelected: false },
  { id: "nbi", name: "NBI Clearance", icon: "🛡️", defaultSelected: false },
  { id: "barangay", name: "Barangay Clearance", icon: "🏛️", defaultSelected: false },
  { id: "medical", name: "Medical Certificate", icon: "🩺", defaultSelected: false },
  { id: "portfolio", name: "Portfolio", icon: "🎨", defaultSelected: false },
  { id: "driver_license", name: "Driver's License", icon: "🚗", defaultSelected: false },
];

/**
 * Encodes application requirements into a structured string format inside required_certifications
 */
export function encodeApplicationRequirements(certificationsText = "", requirementsArray = []) {
  const cleanCerts = (certificationsText || "").replace(/\|\|DOC_REQ:[\s\S]*$/, "").trim();
  if (!requirementsArray || requirementsArray.length === 0) return cleanCerts;
  
  // Format as clean list of requirement strings
  const formattedArray = requirementsArray.map(item => 
    typeof item === "object" ? item.name : String(item)
  ).filter(Boolean);

  return `${cleanCerts} ||DOC_REQ:${JSON.stringify(formattedArray)}`;
}

/**
 * Parses job object to extract clean certifications and employer application document requirements
 */
export function parseJobRequirements(job) {
  const rawCerts = job?.required_certifications || "";
  let certsText = rawCerts;
  let docRequirements = [];

  if (rawCerts.includes("||DOC_REQ:")) {
    const parts = rawCerts.split("||DOC_REQ:");
    certsText = parts[0].trim();
    try {
      const parsed = JSON.parse(parts[1]);
      if (Array.isArray(parsed)) {
        docRequirements = parsed;
      }
    } catch (e) {
      docRequirements = [];
    }
  }

  // Default baseline requirements if employer has not specified custom requirements
  if (!docRequirements || docRequirements.length === 0) {
    docRequirements = ["Resume / CV", "Valid Government ID"];
  }

  return {
    cleanCertifications: certsText,
    applicationRequirements: docRequirements
  };
}
