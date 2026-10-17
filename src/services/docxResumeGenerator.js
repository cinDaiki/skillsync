/**
 * src/services/docxResumeGenerator.js
 *
 * Client-safe, zero-dependency DOCX generator for SkillSync Form-First Resume Builder.
 * Generates an editable, single-column Microsoft Word (.docx) document formatted with standard
 * WordprocessingML tags and packed in an Open Packaging Conventions (PKZIP) archive.
 *
 * Compatible with Microsoft Word, Google Docs, LibreOffice, and SkillSync's internal parseResumeFile.
 */

// Precomputed CRC32 table for pure JavaScript ZIP generation
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function calculateCrc32(uint8Array) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < uint8Array.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ uint8Array[i]) & 0xFF];
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Escapes characters for XML safety
 */
export function escapeXml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Build WordprocessingML paragraph
 */
function createWParagraph(text, opts = {}) {
  const {
    bold = false,
    italic = false,
    size = 21, // 10.5pt (half-points: 21)
    color = "1E293B",
    spaceAfter = 120,
    spaceBefore = 0,
    bullet = false
  } = opts;

  const escaped = escapeXml(text);
  const bulletPr = bullet ? `<w:ind w:left="360" w:hanging="240"/>` : "";
  const bulletSymbol = bullet ? `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="${size}"/><w:color w:val="${color}"/></w:rPr><w:t>• </w:t></w:r>` : "";

  return `<w:p>
    <w:pPr>
      <w:spacing w:before="${spaceBefore}" w:after="${spaceAfter}" w:line="260" w:lineRule="auto"/>
      ${bulletPr}
    </w:pPr>
    ${bulletSymbol}
    <w:r>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
        ${bold ? "<w:b/>" : ""}
        ${italic ? "<w:i/>" : ""}
        <w:sz w:val="${size}"/>
        <w:szCs w:val="${size}"/>
        <w:color w:val="${color}"/>
      </w:rPr>
      <w:t xml:space="preserve">${escaped}</w:t>
    </w:r>
  </w:p>`;
}

function createWHeading(title) {
  const escaped = escapeXml(title.toUpperCase());
  return `<w:p>
    <w:pPr>
      <w:pBdr>
        <w:bottom w:val="single" w:sz="6" w:space="4" w:color="0284C7"/>
      </w:pBdr>
      <w:spacing w:before="240" w:after="100"/>
    </w:pPr>
    <w:r>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
        <w:b/>
        <w:sz w:val="26"/>
        <w:color w:val="0F172A"/>
      </w:rPr>
      <w:t>${escaped}</w:t>
    </w:r>
  </w:p>`;
}

/**
 * Builds the complete word/document.xml from structured resume data
 */
export function buildDocumentXml(resumeData) {
  const {
    personalDetails = {},
    education = {},
    skills = [],
    experience = {},
    projectsAndCredentials = {},
    summary = ""
  } = resumeData;

  const paragraphs = [];

  // 1. Candidate Header (Full Name + Contact Info)
  const candidateName = personalDetails.fullName?.trim() || "Candidate Resume";
  paragraphs.push(`<w:p>
    <w:pPr>
      <w:jc w:val="center"/>
      <w:spacing w:before="0" w:after="80"/>
    </w:pPr>
    <w:r>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
        <w:b/>
        <w:sz w:val="40"/>
        <w:color w:val="0F172A"/>
      </w:rPr>
      <w:t>${escapeXml(candidateName)}</w:t>
    </w:r>
  </w:p>`);

  // Contact line
  const contactParts = [
    personalDetails.email,
    personalDetails.phone,
    personalDetails.city || personalDetails.region,
    personalDetails.linkedin,
    personalDetails.github,
    personalDetails.portfolio
  ].filter(Boolean);

  if (contactParts.length > 0) {
    paragraphs.push(`<w:p>
      <w:pPr>
        <w:jc w:val="center"/>
        <w:spacing w:before="0" w:after="180"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>
          <w:sz w:val="20"/>
          <w:color w:val="475569"/>
        </w:rPr>
        <w:t>${escapeXml(contactParts.join(" | "))}</w:t>
      </w:r>
    </w:p>`);
  }

  // 2. Professional Summary
  if (summary && summary.trim()) {
    paragraphs.push(createWHeading("Professional Summary"));
    paragraphs.push(createWParagraph(summary.trim(), { size: 21, spaceAfter: 140 }));
  }

  // 3. Skills
  if (skills && skills.length > 0) {
    paragraphs.push(createWHeading("Skills"));
    // Group skills by category if provided, or render formatted list
    const categoryMap = {};
    skills.forEach(skill => {
      const cat = skill.category || "Core Skills";
      if (!categoryMap[cat]) categoryMap[cat] = [];
      const skillName = skill.name || skill;
      const contextStr = skill.context ? ` (${skill.context})` : "";
      categoryMap[cat].push(`${skillName}${contextStr}`);
    });

    for (const [catName, catSkills] of Object.entries(categoryMap)) {
      paragraphs.push(createWParagraph(`${catName}: ${catSkills.join(", ")}`, {
        bold: false,
        size: 21,
        spaceAfter: 80,
        bullet: true
      }));
    }
  }

  // 4. Experience
  const expEntries = experience.entries || [];
  if (expEntries.length > 0 && !experience.noExperience) {
    paragraphs.push(createWHeading("Experience"));
    expEntries.forEach(item => {
      const title = item.title || "Role";
      const org = item.organization ? ` | ${item.organization}` : "";
      const type = item.workType ? ` (${item.workType})` : "";
      const dates = (item.startDate || item.endDate)
        ? ` [${item.startDate || ""} - ${item.isCurrent ? "Present" : (item.endDate || "")}]`
        : "";

      paragraphs.push(createWParagraph(`${title}${org}${type}${dates}`, {
        bold: true,
        size: 22,
        color: "0F172A",
        spaceBefore: 120,
        spaceAfter: 40
      }));

      if (item.responsibilities && item.responsibilities.trim()) {
        const respLines = item.responsibilities.split("\n").filter(l => l.trim());
        respLines.forEach(line => {
          paragraphs.push(createWParagraph(line.trim().replace(/^[•*-]\s*/, ""), {
            size: 20,
            color: "334155",
            spaceAfter: 40,
            bullet: true
          }));
        });
      }

      if (item.achievements && item.achievements.trim()) {
        const achLines = item.achievements.split("\n").filter(l => l.trim());
        achLines.forEach(line => {
          paragraphs.push(createWParagraph(`Achievement: ${line.trim().replace(/^[•*-]\s*/, "")}`, {
            size: 20,
            color: "334155",
            spaceAfter: 40,
            bullet: true
          }));
        });
      }
    });
  } else if (experience.noExperience) {
    // If candidate explicitly reported no work experience
    paragraphs.push(createWHeading("Experience"));
    paragraphs.push(createWParagraph("Seeking entry-level opportunities to apply skills, knowledge, and academic foundation.", {
      italic: true,
      size: 20,
      color: "64748B",
      spaceAfter: 100
    }));
  }

  // 5. Education & Training
  const eduEntries = education.entries || [];
  if (eduEntries.length > 0 && !education.noFormalEducation) {
    paragraphs.push(createWHeading("Education & Training"));
    eduEntries.forEach(item => {
      const institution = item.institution || "Institution";
      const level = item.level ? ` - ${item.level}` : "";
      const course = item.courseOrProgram ? ` (${item.courseOrProgram})` : "";
      const status = item.status ? ` - ${item.status}` : "";
      const dates = (item.startYear || item.endYear || item.startDate || item.endDate)
        ? ` [${item.startYear || item.startDate || ""} - ${item.endYear || item.endDate || "Present"}]`
        : "";

      paragraphs.push(createWParagraph(`${institution}${level}${course}${status}${dates}`, {
        bold: true,
        size: 22,
        color: "0F172A",
        spaceBefore: 100,
        spaceAfter: 40
      }));

      if (item.courseworkAndAchievements && item.courseworkAndAchievements.trim()) {
        paragraphs.push(createWParagraph(item.courseworkAndAchievements.trim(), {
          size: 20,
          color: "334155",
          spaceAfter: 60,
          bullet: true
        }));
      }
    });
  } else if (education.noFormalEducation) {
    paragraphs.push(createWHeading("Education & Training"));
    paragraphs.push(createWParagraph("No formal education to report. Practical skills developed through self-directed learning and practical experience.", {
      italic: true,
      size: 20,
      color: "64748B",
      spaceAfter: 100
    }));
  }

  // 6. Projects & Credentials
  const projects = projectsAndCredentials.projects || [];
  const certs = projectsAndCredentials.certifications || [];
  const training = projectsAndCredentials.training || [];
  const awards = projectsAndCredentials.awards || [];

  if (projects.length > 0) {
    paragraphs.push(createWHeading("Projects"));
    projects.forEach(p => {
      const title = p.title || "Project";
      const role = p.role ? ` (${p.role})` : "";
      const link = p.link ? ` | ${p.link}` : "";
      paragraphs.push(createWParagraph(`${title}${role}${link}`, {
        bold: true,
        size: 21,
        color: "0F172A",
        spaceBefore: 80,
        spaceAfter: 30
      }));
      if (p.description) {
        paragraphs.push(createWParagraph(p.description, { size: 20, spaceAfter: 30, bullet: true }));
      }
      if (p.tools && p.tools.length > 0) {
        paragraphs.push(createWParagraph(`Tools Used: ${Array.isArray(p.tools) ? p.tools.join(", ") : p.tools}`, {
          size: 19,
          color: "475569",
          spaceAfter: 60
        }));
      }
    });
  }

  if (certs.length > 0) {
    paragraphs.push(createWHeading("Certifications & Licenses"));
    certs.forEach(c => {
      const name = c.name || "Certification";
      const issuer = c.issuer ? ` | ${c.issuer}` : "";
      const date = c.issueDate ? ` (${c.issueDate})` : "";
      const credId = c.credentialId ? ` [ID: ${c.credentialId}]` : "";
      paragraphs.push(createWParagraph(`${name}${issuer}${date}${credId}`, {
        bold: true,
        size: 21,
        spaceAfter: 40,
        bullet: true
      }));
    });
  }

  if (training.length > 0) {
    paragraphs.push(createWHeading("Training & Workshops"));
    training.forEach(t => {
      const title = t.title || "Training Program";
      const provider = t.provider ? ` | ${t.provider}` : "";
      const date = t.dateOrYear ? ` (${t.dateOrYear})` : "";
      paragraphs.push(createWParagraph(`${title}${provider}${date}`, {
        bold: true,
        size: 20,
        spaceAfter: 30,
        bullet: true
      }));
      if (t.description) {
        paragraphs.push(createWParagraph(t.description, { size: 19, color: "475569", spaceAfter: 40 }));
      }
    });
  }

  if (awards.length > 0) {
    paragraphs.push(createWHeading("Awards & Recognition"));
    awards.forEach(a => {
      const title = a.title || "Award";
      const issuer = a.issuer ? ` | ${a.issuer}` : "";
      const year = a.year ? ` (${a.year})` : "";
      paragraphs.push(createWParagraph(`${title}${issuer}${year}`, {
        bold: true,
        size: 20,
        spaceAfter: 30,
        bullet: true
      }));
      if (a.description) {
        paragraphs.push(createWParagraph(a.description, { size: 19, color: "475569", spaceAfter: 40 }));
      }
    });
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${paragraphs.join("\n")}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/>
      <w:cols w:num="1" w:space="720"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const WORD_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
</Relationships>`;

const SETTINGS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:zoom w:percent="100"/>
  <w:defaultTabStop w:val="720"/>
  <w:characterSpacingControl w:val="doNotCompress"/>
</w:settings>`;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>
        <w:sz w:val="21"/>
        <w:szCs w:val="21"/>
        <w:color w:val="1E293B"/>
        <w:lang w:val="en-US"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:after="100" w:line="260" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
</w:styles>`;

function getAppXml(title = "Resume") {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Template>Normal.dotm</Template>
  <Application>SkillSync Resume Builder</Application>
  <Company>SkillSync</Company>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
</Properties>`;
}

function getCoreXml(title = "Resume", creator = "SkillSync Candidate") {
  const now = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
                   xmlns:dc="http://purl.org/dc/elements/1.1/"
                   xmlns:dcterms="http://purl.org/dc/terms/"
                   xmlns:dcmitype="http://purl.org/dc/dcmitype/"
                   xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(title)}</dc:title>
  <dc:creator>${escapeXml(creator)}</dc:creator>
  <cp:lastModifiedBy>SkillSync</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
}

/**
 * Creates a valid PKZIP (Open Packaging Conventions) archive Uint8Array.
 * Uses compression method 0 (STORED) for 100% universal reader & parser compatibility.
 */
export function createZipArchive(entries) {
  const encoder = new TextEncoder();
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const entry of entries) {
    const filenameBuf = encoder.encode(entry.name);
    const contentBuf = (entry.content instanceof Uint8Array)
      ? entry.content
      : encoder.encode(String(entry.content));

    const crc = calculateCrc32(contentBuf);
    const uncompressedSize = contentBuf.length;
    const compressedSize = uncompressedSize;
    const method = 0; // STORED

    // 1. Local File Header (30 bytes + name length)
    const localHeader = new Uint8Array(30 + filenameBuf.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // signature
    lv.setUint16(4, 20, true);         // version needed (2.0)
    lv.setUint16(6, 0, true);          // flags
    lv.setUint16(8, method, true);     // method 0 = STORE
    lv.setUint16(10, 0, true);         // mod time
    lv.setUint16(12, 0, true);         // mod date
    lv.setUint32(14, crc, true);       // crc32
    lv.setUint32(18, compressedSize, true);
    lv.setUint32(22, uncompressedSize, true);
    lv.setUint16(26, filenameBuf.length, true);
    lv.setUint16(28, 0, true);         // extra len
    localHeader.set(filenameBuf, 30);

    // 2. Central Directory Header (46 bytes + name length)
    const centralHeader = new Uint8Array(46 + filenameBuf.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // signature
    cv.setUint16(4, 20, true);         // version made by
    cv.setUint16(6, 20, true);         // version needed
    cv.setUint16(8, 0, true);          // flags
    cv.setUint16(10, method, true);    // method
    cv.setUint16(12, 0, true);         // mod time
    cv.setUint16(14, 0, true);         // mod date
    cv.setUint32(16, crc, true);       // crc32
    cv.setUint32(20, compressedSize, true);
    cv.setUint32(24, uncompressedSize, true);
    cv.setUint16(28, filenameBuf.length, true);
    cv.setUint16(30, 0, true);         // extra field len
    cv.setUint16(32, 0, true);         // comment len
    cv.setUint16(34, 0, true);         // disk start
    cv.setUint16(36, 0, true);         // internal attrs
    cv.setUint32(38, 0, true);         // external attrs
    cv.setUint32(42, offset, true);    // local header offset
    centralHeader.set(filenameBuf, 46);

    localHeaders.push({ header: localHeader, content: contentBuf });
    centralHeaders.push(centralHeader);

    offset += localHeader.length + contentBuf.length;
  }

  const centralDirOffset = offset;
  let totalCentralDirLen = 0;
  for (const ch of centralHeaders) totalCentralDirLen += ch.length;

  // 3. End of Central Directory Record (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);                     // disk number
  ev.setUint16(6, 0, true);                     // central dir disk
  ev.setUint16(8, entries.length, true);        // entries on disk
  ev.setUint16(10, entries.length, true);       // total entries
  ev.setUint32(12, totalCentralDirLen, true);   // central dir size
  ev.setUint32(16, centralDirOffset, true);     // central dir offset
  ev.setUint16(20, 0, true);                    // comment len

  // Calculate total buffer length and concatenate
  let totalArchiveLength = 0;
  for (const lh of localHeaders) totalArchiveLength += lh.header.length + lh.content.length;
  totalArchiveLength += totalCentralDirLen + eocd.length;

  const result = new Uint8Array(totalArchiveLength);
  let pos = 0;
  for (const lh of localHeaders) {
    result.set(lh.header, pos);
    pos += lh.header.length;
    result.set(lh.content, pos);
    pos += lh.content.length;
  }
  for (const ch of centralHeaders) {
    result.set(ch, pos);
    pos += ch.length;
  }
  result.set(eocd, pos);

  return result;
}

/**
 * Generate a complete DOCX Blob from canonical structured resume data.
 *
 * @param {object} resumeData - Canonical structured resume object
 * @returns {Blob} DOCX file Blob ready for download or parsing
 */
export function generateDocxResumeBlob(resumeData) {
  const candidateName = resumeData?.personalDetails?.fullName?.trim() || "Candidate";
  const documentXml = buildDocumentXml(resumeData);

  const entries = [
    { name: "[Content_Types].xml", content: CONTENT_TYPES_XML },
    { name: "_rels/.rels", content: ROOT_RELS_XML },
    { name: "word/_rels/document.xml.rels", content: WORD_RELS_XML },
    { name: "word/document.xml", content: documentXml },
    { name: "word/styles.xml", content: STYLES_XML },
    { name: "word/settings.xml", content: SETTINGS_XML },
    { name: "docProps/core.xml", content: getCoreXml(`${candidateName} Resume`, candidateName) },
    { name: "docProps/app.xml", content: getAppXml(`${candidateName} Resume`) }
  ];

  const zipBytes = createZipArchive(entries);
  return new Blob([zipBytes], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  });
}

/**
 * Trigger client browser download for the generated DOCX resume.
 */
export function downloadDocxResume(resumeData, fileName) {
  const blob = generateDocxResumeBlob(resumeData);
  const candidateName = resumeData?.personalDetails?.fullName?.trim() || "Candidate";
  const sanitizedName = candidateName.replace(/[^a-zA-Z0-9_-]/g, "_");
  const finalFileName = fileName || `${sanitizedName}_Resume.docx`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = finalFileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
