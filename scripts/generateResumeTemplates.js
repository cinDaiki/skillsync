import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.resolve(ROOT_DIR, 'public', 'templates');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * Creates a valid PKZIP (Open Packaging Conventions) archive.
 * Storing word/document.xml with compression method 0 (STORED) guarantees
 * maximum compatibility with both unzippers and direct text/regex scanners.
 */
function createZipArchive(entries) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const entry of entries) {
    const filenameBuf = Buffer.from(entry.name, 'utf8');
    const contentBuf = Buffer.isBuffer(entry.content)
      ? entry.content
      : Buffer.from(entry.content, 'utf8');

    const crc = zlib.crc32(contentBuf);
    const uncompressedSize = contentBuf.length;
    // Method 0: STORE (uncompressed), Method 8: DEFLATE
    const method = entry.method !== undefined ? entry.method : 0;
    const compressedBuf = method === 8 ? zlib.deflateRawSync(contentBuf) : contentBuf;
    const compressedSize = compressedBuf.length;

    // 1. Local File Header
    const localHeader = Buffer.alloc(30 + filenameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4);         // version needed (2.0)
    localHeader.writeUInt16LE(0, 6);          // flags
    localHeader.writeUInt16LE(method, 8);     // compression method
    localHeader.writeUInt16LE(0, 10);        // mod time
    localHeader.writeUInt16LE(0, 12);        // mod date
    localHeader.writeUInt32LE(crc, 14);       // crc32
    localHeader.writeUInt32LE(compressedSize, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(filenameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);        // extra field length
    filenameBuf.copy(localHeader, 30);

    // 2. Central Directory Header
    const centralHeader = Buffer.alloc(46 + filenameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0); // signature
    centralHeader.writeUInt16LE(20, 4);          // version made by
    centralHeader.writeUInt16LE(20, 6);          // version needed
    centralHeader.writeUInt16LE(0, 8);           // flags
    centralHeader.writeUInt16LE(method, 10);     // method
    centralHeader.writeUInt16LE(0, 12);         // mod time
    centralHeader.writeUInt16LE(0, 14);         // mod date
    centralHeader.writeUInt32LE(crc, 16);        // crc32
    centralHeader.writeUInt32LE(compressedSize, 20);
    centralHeader.writeUInt32LE(uncompressedSize, 24);
    centralHeader.writeUInt16LE(filenameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);         // extra field len
    centralHeader.writeUInt16LE(0, 32);         // comment len
    centralHeader.writeUInt16LE(0, 34);         // disk start
    centralHeader.writeUInt16LE(0, 36);         // internal attrs
    centralHeader.writeUInt32LE(0, 38);         // external attrs
    centralHeader.writeUInt32LE(offset, 42);    // local header offset
    filenameBuf.copy(centralHeader, 46);

    localHeaders.push(Buffer.concat([localHeader, compressedBuf]));
    centralHeaders.push(centralHeader);

    offset += localHeader.length + compressedBuf.length;
  }

  const centralDirOffset = offset;
  const centralDirBuf = Buffer.concat(centralHeaders);
  const centralDirSize = centralDirBuf.length;

  // 3. End of Central Directory Record (EOCD)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);                     // disk number
  eocd.writeUInt16LE(0, 6);                     // central dir disk
  eocd.writeUInt16LE(entries.length, 8);        // entries on disk
  eocd.writeUInt16LE(entries.length, 10);       // total entries
  eocd.writeUInt32LE(centralDirSize, 12);       // central dir size
  eocd.writeUInt32LE(centralDirOffset, 16);     // central dir offset
  eocd.writeUInt16LE(0, 20);                    // comment len

  return Buffer.concat([...localHeaders, centralDirBuf, eocd]);
}

// ── Boilerplate OpenPackaging XMLs ──────────────────────────────────────────

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

function getAppXml(title) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Template>Normal.dotm</Template>
  <TotalTime>1</TotalTime>
  <Pages>1</Pages>
  <Words>350</Words>
  <Characters>2100</Characters>
  <Application>Microsoft Office Word</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <Company>SkillSync</Company>
  <LinksUpToDate>false</LinksUpToDate>
  <SharedDoc>false</SharedDoc>
  <HyperlinksChanged>false</HyperlinksChanged>
  <AppVersion>16.0000</AppVersion>
</Properties>`;
}

function getCoreXml(title, subject) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${title}</dc:title>
  <dc:subject>${subject}</dc:subject>
  <dc:creator>SkillSync ATS Platform</dc:creator>
  <cp:lastModifiedBy>SkillSync</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">2026-10-14T00:00:00Z</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">2026-10-14T00:00:00Z</dcterms:modified>
</cp:coreProperties>`;
}

// ── OpenXML Helpers ──────────────────────────────────────────────────────────

function escapeXml(unsafe) {
  if (!unsafe) return '';
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlParagraph(text, opts = {}) {
  const {
    bold = false,
    size = 21,
    color = "1E293B",
    align = "left",
    spaceBefore = 0,
    spaceAfter = 80,
    bottomBorder = false,
    italic = false
  } = opts;

  let pPr = `<w:pPr>`;
  if (align !== 'left') pPr += `<w:jc w:val="${align}"/>`;
  pPr += `<w:spacing w:before="${spaceBefore}" w:after="${spaceAfter}" w:line="240" w:lineRule="auto"/>`;
  if (bottomBorder) {
    pPr += `<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="4" w:color="2563EB"/></w:pBdr>`;
  }
  pPr += `</w:pPr>`;

  let rPr = `<w:rPr>`;
  rPr += `<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>`;
  if (bold) rPr += `<w:b/>`;
  if (italic) rPr += `<w:i/>`;
  rPr += `<w:sz w:val="${size}"/>`;
  rPr += `<w:color w:val="${color}"/>`;
  rPr += `</w:rPr>`;

  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function xmlHeading(title) {
  return xmlParagraph(title, {
    bold: true,
    size: 24, // 12pt
    color: "1D4ED8", // SkillSync blue
    spaceBefore: 200,
    spaceAfter: 60,
    bottomBorder: true
  });
}

function xmlBullet(text, leadBold = "") {
  let rContent = '';
  if (leadBold) {
    rContent += `<w:r><w:rPr><w:b/><w:sz w:val="20"/><w:color w:val="1E293B"/></w:rPr><w:t xml:space="preserve">${escapeXml(leadBold)} </w:t></w:r>`;
  }
  rContent += `<w:r><w:rPr><w:sz w:val="20"/><w:color w:val="334155"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;

  return `<w:p>
    <w:pPr>
      <w:spacing w:before="30" w:after="40" w:line="240" w:lineRule="auto"/>
      <w:ind w:left="400" w:hanging="240"/>
    </w:pPr>
    <w:r>
      <w:rPr><w:color w:val="2563EB"/><w:sz w:val="20"/></w:rPr>
      <w:t xml:space="preserve">• </w:t>
    </w:r>
    ${rContent}
  </w:p>`;
}

// ── 1. Blank Editable Template Definition ───────────────────────────────────

function buildTemplateDocumentXml() {
  const bodyXml = [
    // Header - Full Name
    xmlParagraph("[YOUR FULL NAME]", {
      bold: true,
      size: 40, // 20pt
      color: "0F172A",
      align: "center",
      spaceBefore: 0,
      spaceAfter: 40
    }),
    // Professional Headline
    xmlParagraph("[Target Job Title / Professional Headline | e.g., Full Stack Software Engineer]", {
      bold: true,
      size: 23,
      color: "2563EB",
      align: "center",
      spaceBefore: 0,
      spaceAfter: 60
    }),
    // Contact Info Line
    xmlParagraph("[City, Country]  |  [+63 917 000 0000]  |  [your.email@example.com]  |  [linkedin.com/in/your-profile]  |  [github.com/your-username]", {
      bold: false,
      size: 19,
      color: "475569",
      align: "center",
      spaceBefore: 0,
      spaceAfter: 160
    }),

    // Section 1: Professional Summary
    xmlHeading("PROFESSIONAL SUMMARY"),
    xmlParagraph("[Write 2-4 concise sentences summarizing your professional background, core expertise, notable achievements, and target role. Highlight 3-5 of your strongest competencies that match the requirements of jobs you want to apply for in SkillSync.]", {
      italic: true,
      color: "64748B",
      size: 20,
      spaceAfter: 120
    }),

    // Section 2: Core Skills
    xmlHeading("CORE SKILLS"),
    xmlParagraph("[Instructions: Group your skills into clean, comma-separated categories. Use recognized industry terms so the SkillSync ATS scanner accurately detects and credits your abilities.]", {
      italic: true,
      color: "64748B",
      size: 19,
      spaceAfter: 60
    }),
    xmlBullet("JavaScript, TypeScript, Python, Java, C#, SQL, HTML, CSS", "Programming Languages:"),
    xmlBullet("React, Node.js, Express, Next.js, FastAPI, Spring Boot, Tailwind CSS", "Frameworks & Libraries:"),
    xmlBullet("PostgreSQL, MySQL, MongoDB, Redis, Supabase, Firebase", "Databases & Storage:"),
    xmlBullet("AWS, Docker, Kubernetes, CI/CD, Git, GitHub, Linux, Nginx", "Cloud & DevOps:"),
    xmlBullet("Agile, Scrum, REST API, GraphQL, System Design, Automated Testing", "Methodologies & Tools:"),

    // Section 3: Work Experience
    xmlHeading("WORK EXPERIENCE"),
    xmlParagraph("[Current or Most Recent Job Title]  |  [Company Name]  |  [City, Country]", {
      bold: true,
      size: 21,
      color: "0F172A",
      spaceBefore: 60,
      spaceAfter: 20
    }),
    xmlParagraph("[Start Month, Year] – [Present / End Month, Year]", {
      italic: true,
      size: 19,
      color: "64748B",
      spaceBefore: 0,
      spaceAfter: 50
    }),
    xmlBullet("[Action verb] + [task / project] + [metric / measurable result, e.g., improved load time by 35%]."),
    xmlBullet("Architected and deployed scalable web applications using [Key Technologies, e.g., React, Node.js, PostgreSQL]."),
    xmlBullet("Collaborated with cross-functional product and design teams in [Agile / Scrum] sprints to deliver product milestones."),
    xmlBullet("Mentored junior team members and championed automated CI/CD testing practices."),

    xmlParagraph("[Previous Job Title]  |  [Previous Company Name]  |  [City, Country]", {
      bold: true,
      size: 21,
      color: "0F172A",
      spaceBefore: 120,
      spaceAfter: 20
    }),
    xmlParagraph("[Start Month, Year] – [End Month, Year]", {
      italic: true,
      size: 19,
      color: "64748B",
      spaceBefore: 0,
      spaceAfter: 50
    }),
    xmlBullet("Engineered RESTful APIs and backend services handling [high volume] daily requests."),
    xmlBullet("Optimized database queries and schema designs, reducing response latency by [X%]."),
    xmlBullet("Resolved critical software defects and maintained high uptime across staging and production."),

    // Section 4: Education
    xmlHeading("EDUCATION"),
    xmlParagraph("[Degree Name, e.g., Bachelor of Science in Computer Science / Information Technology]", {
      bold: true,
      size: 21,
      color: "0F172A",
      spaceBefore: 60,
      spaceAfter: 20
    }),
    xmlParagraph("[University / College Name]  |  [City, Country]", {
      size: 20,
      color: "334155",
      spaceBefore: 0,
      spaceAfter: 20
    }),
    xmlParagraph("Graduation: [Month, Year]  |  [Optional: Magna Cum Laude / Dean's Lister / GPA: 3.8/4.0]", {
      italic: true,
      size: 19,
      color: "64748B",
      spaceBefore: 0,
      spaceAfter: 100
    }),

    // Section 5: Key Projects
    xmlHeading("KEY PROJECTS"),
    xmlParagraph("[Project Title 1]  |  [Technologies: React, Node.js, PostgreSQL, Docker]", {
      bold: true,
      size: 21,
      color: "0F172A",
      spaceBefore: 60,
      spaceAfter: 30
    }),
    xmlBullet("Designed and implemented a full-stack platform featuring authentication, real-time updates, and responsive UI."),
    xmlBullet("Deployed to cloud infrastructure using automated Docker containers with 99.9% availability."),

    xmlParagraph("[Project Title 2]  |  [Technologies: Python, FastAPI, Machine Learning, Redis]", {
      bold: true,
      size: 21,
      color: "0F172A",
      spaceBefore: 100,
      spaceAfter: 30
    }),
    xmlBullet("Developed an open-source data analytics engine processing structured datasets with interactive visualizations."),

    // Section 6: Certifications & Credentials
    xmlHeading("CERTIFICATIONS & CREDENTIALS"),
    xmlBullet("[Certification Name, e.g., AWS Certified Solutions Architect]  |  [Issuing Body] – [Year]"),
    xmlBullet("[Certification Name, e.g., Meta Front-End Developer Professional Certificate]  |  [Issuing Body] – [Year]"),
    xmlBullet("[Certification Name, e.g., Certified ScrumMaster (CSM)]  |  [Issuing Body] – [Year]"),

    // Section 7: Honors & Achievements
    xmlHeading("HONORS & ACHIEVEMENTS"),
    xmlBullet("[Award / Recognition, e.g., 1st Place Champion, National Software Hackathon] – [Year]"),
    xmlBullet("[Academic or Company Honor, e.g., Outstanding Innovation Award] – [Organization / Year]")
  ];

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyXml.join('\n')}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/>
      <w:cols w:space="720"/>
      <w:docGrid w:linePitch="360"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

// ── 2. Completed Fictional Sample Definition ────────────────────────────────

function buildSampleDocumentXml() {
  const bodyXml = [
    // Header
    xmlParagraph("ALEX RIVERA", {
      bold: true,
      size: 40,
      color: "0F172A",
      align: "center",
      spaceBefore: 0,
      spaceAfter: 40
    }),
    xmlParagraph("Senior Full Stack Software Engineer", {
      bold: true,
      size: 23,
      color: "2563EB",
      align: "center",
      spaceBefore: 0,
      spaceAfter: 60
    }),
    xmlParagraph("Manila, Philippines  |  +63 917 555 0192  |  alex.rivera.dev@example.com  |  linkedin.com/in/alexrivera-dev  |  github.com/alexrivera-dev", {
      bold: false,
      size: 19,
      color: "475569",
      align: "center",
      spaceBefore: 0,
      spaceAfter: 160
    }),

    // Professional Summary
    xmlHeading("PROFESSIONAL SUMMARY"),
    xmlParagraph("Results-driven Senior Full Stack Software Engineer with 5+ years of experience architecting, building, and scaling resilient web applications and microservices. Expert in JavaScript, TypeScript, React, Node.js, Python, PostgreSQL, and cloud infrastructure on AWS. Demonstrated track record of leading agile engineering teams, cutting API latencies by 65%, and delivering user-centric digital products that serve over 300,000 active users.", {
      color: "334155",
      size: 20,
      spaceAfter: 120
    }),

    // Core Skills
    xmlHeading("CORE SKILLS"),
    xmlBullet("JavaScript, TypeScript, Python, SQL, HTML, CSS", "Programming Languages:"),
    xmlBullet("React, Node.js, Express, Next.js, FastAPI, Tailwind CSS", "Frameworks & Libraries:"),
    xmlBullet("PostgreSQL, MySQL, MongoDB, Redis, Supabase", "Databases & Storage:"),
    xmlBullet("AWS, Docker, Kubernetes, CI/CD, Git, GitHub, Linux, Nginx", "Cloud & DevOps:"),
    xmlBullet("Agile, Scrum, Jira, REST API, GraphQL, System Design, Unit Testing", "Methodologies & Tools:"),

    // Work Experience
    xmlHeading("WORK EXPERIENCE"),
    xmlParagraph("Senior Full Stack Engineer  |  NexaTech Cloud Solutions  |  Taguig, Philippines", {
      bold: true,
      size: 21,
      color: "0F172A",
      spaceBefore: 60,
      spaceAfter: 20
    }),
    xmlParagraph("January 2023 – Present", {
      italic: true,
      size: 19,
      color: "64748B",
      spaceBefore: 0,
      spaceAfter: 50
    }),
    xmlBullet("Architected and delivered high-performance distributed microservices using React, Node.js, TypeScript, and PostgreSQL serving 300,000+ monthly active users with 99.98% uptime."),
    xmlBullet("Built automated containerized CI/CD deployment pipelines using Docker, GitHub Actions, and AWS ECS, reducing software deployment cycle times by 45%."),
    xmlBullet("Engineered Redis caching layer and optimized relational SQL queries, cutting p99 API response latencies from 650ms to 95ms."),
    xmlBullet("Mentored 5 junior and mid-level software engineers in modern TypeScript, clean architecture, and test-driven development."),

    xmlParagraph("Full Stack Software Engineer  |  MetroScale Technologies  |  Makati, Philippines", {
      bold: true,
      size: 21,
      color: "0F172A",
      spaceBefore: 120,
      spaceAfter: 20
    }),
    xmlParagraph("June 2020 – December 2022", {
      italic: true,
      size: 19,
      color: "64748B",
      spaceBefore: 0,
      spaceAfter: 50
    }),
    xmlBullet("Developed responsive single-page candidate matching interfaces using React, Redux, and Tailwind CSS, increasing candidate profile completion rates by 32%."),
    xmlBullet("Designed RESTful APIs and asynchronous background task workers using Python, FastAPI, and PostgreSQL with 92% automated test coverage."),
    xmlBullet("Collaborated with cross-functional product managers and UX researchers in bi-weekly agile Scrum sprints to ship 16 production releases on schedule."),

    // Education
    xmlHeading("EDUCATION"),
    xmlParagraph("Bachelor of Science in Computer Science", {
      bold: true,
      size: 21,
      color: "0F172A",
      spaceBefore: 60,
      spaceAfter: 20
    }),
    xmlParagraph("University of the Philippines Diliman  |  Quezon City, Philippines", {
      size: 20,
      color: "334155",
      spaceBefore: 0,
      spaceAfter: 20
    }),
    xmlParagraph("Graduated: July 2020  |  Magna Cum Laude  |  GWA: 1.35", {
      italic: true,
      size: 19,
      color: "64748B",
      spaceBefore: 0,
      spaceAfter: 100
    }),

    // Key Projects
    xmlHeading("KEY PROJECTS"),
    xmlParagraph("CloudTelemetry: Real-Time Performance Monitor  |  React, TypeScript, Node.js, WebSocket", {
      bold: true,
      size: 21,
      color: "0F172A",
      spaceBefore: 60,
      spaceAfter: 30
    }),
    xmlBullet("Created an open-source real-time application metrics monitor streaming server CPU, memory, and latency data via WebSocket."),
    xmlBullet("Engineered clean dashboard visualizer with custom Chart.js widgets and packaged it for one-click Docker container deployment."),

    xmlParagraph("CampusHire: University Career & Internship Portal  |  Python, FastAPI, PostgreSQL, React", {
      bold: true,
      size: 21,
      color: "0F172A",
      spaceBefore: 100,
      spaceAfter: 30
    }),
    xmlBullet("Built university capstone project connecting 1,200+ undergraduate students with verified partner employers and internship programs."),

    // Certifications & Credentials
    xmlHeading("CERTIFICATIONS & CREDENTIALS"),
    xmlBullet("AWS Certified Solutions Architect – Associate  |  Amazon Web Services – 2024"),
    xmlBullet("Meta Certified Front-End Developer Professional Certificate  |  Meta – 2023"),
    xmlBullet("Certified ScrumMaster (CSM)  |  Scrum Alliance – 2022"),

    // Honors & Achievements
    xmlHeading("HONORS & ACHIEVEMENTS"),
    xmlBullet("1st Place Grand Champion, Philippine National Developer Hackathon – 2023"),
    xmlBullet("Excellence in Engineering Leadership Award, NexaTech Cloud Solutions – 2024"),
    xmlBullet("University Academic Scholar and Dean's Lister, UP Diliman – 2016 to 2020")
  ];

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${bodyXml.join('\n')}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/>
      <w:cols w:space="720"/>
      <w:docGrid w:linePitch="360"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

// ── 3. Plain Text Writing Guide ─────────────────────────────────────────────

const WRITING_GUIDE_TEXT = `================================================================================
SKILLSYNC ATS RESUME WRITING GUIDE & SECTION-BY-SECTION INSTRUCTIONS
================================================================================

Welcome to the SkillSync Resume Optimization Guide. This document provides clear,
practical instructions to help you complete your resume template, maximize your
ATS (Applicant Tracking System) parse accuracy, and achieve high job-fit scores.

--------------------------------------------------------------------------------
1. GENERAL FORMATTING RULES FOR ATS COMPATIBILITY
--------------------------------------------------------------------------------
• Single-Column Layout: SkillSync and modern ATS parsers read resumes from top
  to bottom. Multi-column tables, text boxes, and sidebars can scramble the
  extraction sequence.
• Standard Fonts: Use standard, clean fonts such as Calibri, Arial, Helvetica,
  or Georgia (10 to 12 pt for body text, 14 to 20 pt for section headers and name).
• Conventional Section Headings: Always use standard section titles:
    - PROFESSIONAL SUMMARY
    - CORE SKILLS (or TECHNICAL SKILLS)
    - WORK EXPERIENCE
    - EDUCATION
    - KEY PROJECTS
    - CERTIFICATIONS & CREDENTIALS
    - HONORS & ACHIEVEMENTS
• File Formats: Save your completed file as .docx (Microsoft Word) or .pdf.
  Both formats are fully parsed and validated by SkillSync.

--------------------------------------------------------------------------------
2. SECTION-BY-SECTION FILLING INSTRUCTIONS
--------------------------------------------------------------------------------

[A] CONTACT INFORMATION (Top of Page)
• Full Name: Clearly positioned at the top in large font (18-22 pt bold).
• Professional Title: Target role matching the jobs you seek (e.g., Senior Full Stack Engineer).
• Email Address: Professional email format (e.g., first.last@example.com).
• Phone Number: Include international or area code (e.g., +63 917 555 0192).
• Location: City and Country (street address is unnecessary for privacy).
• Links: Include clean URLs to your LinkedIn and GitHub / Portfolio profile.

[B] PROFESSIONAL SUMMARY
• Keep it between 2 to 4 impactful sentences.
• Formula: [Target Job Title] + [Years of Experience] + [Core Strengths & Technologies] + [1-2 Measurable Key Impact Achievements].
• Avoid generic clichés like "hardworking team player". Be specific about what you build.

[C] CORE SKILLS
• Categorize your skills: Programming Languages, Frameworks, Databases, Cloud & DevOps, Tools.
• Match Industry Standard Terms: Use exact terms recognized by SkillSync's AI dictionary
  (e.g., "React", "Node.js", "TypeScript", "Python", "Docker", "AWS", "SQL", "Agile").
• Avoid abbreviations that obscure skills (e.g., write "JavaScript" rather than "JS").

[D] WORK EXPERIENCE
• Structure: [Job Title] | [Company Name] | [City, Country] | [Dates: Month Year - Month Year/Present]
• Bullet Points: 3 to 5 bullets per position.
• High-Impact Formula:
    Action Verb + Task/Scope + Technologies Used + Measurable Result/Metric
  Example:
    "Architected distributed microservices in Node.js and PostgreSQL, cutting API latency by 45%."
• Quantify impact: percentages, numbers of users, revenue, time saved, or defect reductions.

[E] EDUCATION
• Include: Degree name, Major/Specialization, Institution name, City, Country, Graduation year.
• Format: "Bachelor of Science in Computer Science" or "BS in Information Technology".
• Honors: Mention Magna Cum Laude, Dean's Lister, or relevant academic distinctions.

[F] KEY PROJECTS
• Ideal for demonstrating practical experience, especially for recent graduates and career switchers.
• Include project title, key technologies used, problem solved, and measurable impact or demo link.

[G] CERTIFICATIONS & CREDENTIALS
• Format: [Certification Name] | [Issuing Body] – [Year]
• Examples: AWS Certified Solutions Architect, Meta Front-End Developer, Certified ScrumMaster, NC II, TESDA.
• SkillSync awards bonus credential score points for verified professional certifications.

[H] HONORS & ACHIEVEMENTS
• List hackathons, innovation awards, academic distinctions, or community contributions.

--------------------------------------------------------------------------------
3. UPLOADING & VERIFYING YOUR RESUME IN SKILLSYNC
--------------------------------------------------------------------------------
1. Open the SkillSync Candidate Resume page (/candidate/resume).
2. Click "Upload New Resume" or "Choose File".
3. Select your saved .docx or .pdf file.
4. SkillSync will automatically:
   - Extract your contact details and qualifications.
   - Scan and tag recognized technical and professional skills.
   - Calculate your ATS Completeness and Resume Quality Score.
   - Generate your personalized Recommended Jobs with match percentages!
5. Review your extracted skills in the AI Skill Dictionary tab and adjust any tags
   to keep your profile continuously updated.
================================================================================
`;

// ── Build and Save Assets ───────────────────────────────────────────────────

console.log('Generating SkillSync resume templates...');

// 1. SkillSync_ATS_Resume_Template.docx
const templateZip = createZipArchive([
  { name: '[Content_Types].xml', content: CONTENT_TYPES_XML, method: 0 },
  { name: '_rels/.rels', content: ROOT_RELS_XML, method: 0 },
  { name: 'word/_rels/document.xml.rels', content: WORD_RELS_XML, method: 0 },
  { name: 'word/settings.xml', content: SETTINGS_XML, method: 0 },
  { name: 'word/styles.xml', content: STYLES_XML, method: 0 },
  { name: 'docProps/core.xml', content: getCoreXml('SkillSync ATS Resume Template', 'Editable Single-Column Resume Template'), method: 0 },
  { name: 'docProps/app.xml', content: getAppXml('SkillSync ATS Resume Template'), method: 0 },
  { name: 'word/document.xml', content: buildTemplateDocumentXml(), method: 0 }
]);

const templatePath = path.join(OUTPUT_DIR, 'SkillSync_ATS_Resume_Template.docx');
fs.writeFileSync(templatePath, templateZip);
console.log(`✓ Created: ${templatePath} (${templateZip.length} bytes)`);

// 2. SkillSync_Completed_Sample_Resume.docx
const sampleZip = createZipArchive([
  { name: '[Content_Types].xml', content: CONTENT_TYPES_XML, method: 0 },
  { name: '_rels/.rels', content: ROOT_RELS_XML, method: 0 },
  { name: 'word/_rels/document.xml.rels', content: WORD_RELS_XML, method: 0 },
  { name: 'word/settings.xml', content: SETTINGS_XML, method: 0 },
  { name: 'word/styles.xml', content: STYLES_XML, method: 0 },
  { name: 'docProps/core.xml', content: getCoreXml('Alex Rivera - Completed Sample Resume', 'SkillSync Fictional Sample Resume'), method: 0 },
  { name: 'docProps/app.xml', content: getAppXml('Alex Rivera - Completed Sample Resume'), method: 0 },
  { name: 'word/document.xml', content: buildSampleDocumentXml(), method: 0 }
]);

const samplePath = path.join(OUTPUT_DIR, 'SkillSync_Completed_Sample_Resume.docx');
fs.writeFileSync(samplePath, sampleZip);
console.log(`✓ Created: ${samplePath} (${sampleZip.length} bytes)`);

// 3. SkillSync_Resume_Writing_Guide.txt
const guidePath = path.join(OUTPUT_DIR, 'SkillSync_Resume_Writing_Guide.txt');
fs.writeFileSync(guidePath, WRITING_GUIDE_TEXT, 'utf8');
console.log(`✓ Created: ${guidePath} (${Buffer.byteLength(WRITING_GUIDE_TEXT)} bytes)`);

console.log('All resume template assets generated successfully!');
