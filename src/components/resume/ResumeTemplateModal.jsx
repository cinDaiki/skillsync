import { useState } from "react";

export default function ResumeTemplateModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState("sections");

  if (!isOpen) return null;

  return (
    <div className="preview-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="template-modal-title">
      <div className="preview-modal-content template-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="preview-modal-header template-modal-header">
          <div>
            <h3 id="template-modal-title" style={{ display: "flex", alignItems: "center", gap: "8px", margin: 0 }}>
              <span>📝</span> SkillSync Resume Template & ATS Guide
            </h3>
            <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#64748b" }}>
              Standardized formatting instructions to maximize parser accuracy and candidate job-fit scores.
            </p>
          </div>
          <button className="preview-modal-close" onClick={onClose} aria-label="Close modal">×</button>
        </div>

        {/* Tab Navigation */}
        <div className="template-modal-tabs">
          <button
            type="button"
            className={`template-tab-btn ${activeTab === "sections" ? "active" : ""}`}
            onClick={() => setActiveTab("sections")}
          >
            📋 Section Instructions
          </button>
          <button
            type="button"
            className={`template-tab-btn ${activeTab === "sample" ? "active" : ""}`}
            onClick={() => setActiveTab("sample")}
          >
            👤 Completed Sample
          </button>
          <button
            type="button"
            className={`template-tab-btn ${activeTab === "ats" ? "active" : ""}`}
            onClick={() => setActiveTab("ats")}
          >
            🤖 ATS Scanner Checklist
          </button>
        </div>

        {/* Modal Body */}
        <div className="template-modal-body">
          {activeTab === "sections" && (
            <div className="template-guide-content">
              <div className="template-guide-intro">
                <h4>Why Use the SkillSync Standard Template?</h4>
                <p>
                  SkillSync’s AI parser and algorithmic matching engine evaluate resumes against job requirements.
                  Using our single-column, cleanly structured Microsoft Word (<code>.docx</code>) template ensures that
                  your skills, work history, education, and credentials are read with 100% fidelity.
                </p>
              </div>

              <div className="template-section-cards">
                <div className="template-section-item">
                  <div className="section-badge">1. Contact Information</div>
                  <h5>Candidate Header</h5>
                  <p>
                    Place your full name at the top in large bold font (18–22pt). Immediately follow with your target professional headline (e.g., <em>Senior Full Stack Developer</em>) and a single line of contact items separated by vertical pipes:
                  </p>
                  <pre className="template-code-block">
                    [City, Country] | [+63 917 555 0192] | [your.email@example.com] | [linkedin.com/in/username] | [github.com/username]
                  </pre>
                  <span className="section-tip">💡 Tip: Avoid putting contact information in headers or footers, as some ATS parsers bypass margins.</span>
                </div>

                <div className="template-section-item">
                  <div className="section-badge">2. Summary</div>
                  <h5>Professional Summary</h5>
                  <p>
                    Write 2 to 4 high-impact sentences highlighting your title, years of experience, primary technical stack, and major accomplishments:
                  </p>
                  <blockquote className="template-quote">
                    "Results-driven Senior Full Stack Software Engineer with 5+ years of experience architecting resilient web applications. Expert in JavaScript, TypeScript, React, Node.js, and AWS with a track record of cutting API latencies by 65%."
                  </blockquote>
                </div>

                <div className="template-section-item">
                  <div className="section-badge">3. Skills</div>
                  <h5>Core Skills / Technical Skills</h5>
                  <p>
                    Group skills into clear categories using recognized industry terms. Avoid obscure abbreviations so the SkillSync dictionary recognizes them:
                  </p>
                  <ul>
                    <li><strong>Languages:</strong> JavaScript, TypeScript, Python, SQL, HTML, CSS</li>
                    <li><strong>Frameworks:</strong> React, Node.js, Express, Next.js, FastAPI, Tailwind CSS</li>
                    <li><strong>Databases:</strong> PostgreSQL, MySQL, MongoDB, Redis, Supabase</li>
                    <li><strong>Cloud & DevOps:</strong> AWS, Docker, Kubernetes, CI/CD, Git, Linux</li>
                  </ul>
                </div>

                <div className="template-section-item">
                  <div className="section-badge">4. Work Experience</div>
                  <h5>Work Experience / Employment History</h5>
                  <p>
                    List roles in reverse chronological order. State: <strong>[Job Title] | [Company Name] | [City, Country]</strong> followed by <strong>[Start Date – End Date]</strong>.
                  </p>
                  <p>Use the high-impact bullet formula: <em>Action Verb + Task + Technologies Used + Measurable Metric</em>.</p>
                  <pre className="template-code-block">
                    • Architected high-throughput microservices using React, Node.js, and PostgreSQL serving 300,000+ active users.
                    • Reduced deployment cycle times by 45% via automated Docker CI/CD pipelines in GitHub Actions.
                  </pre>
                </div>

                <div className="template-section-item">
                  <div className="section-badge">5. Education</div>
                  <h5>Education / Academic Background</h5>
                  <p>
                    State your degree, major/field, institution, and graduation year:
                  </p>
                  <pre className="template-code-block">
                    Bachelor of Science in Computer Science
                    University of the Philippines Diliman | Quezon City, Philippines
                    Graduated: July 2020 | Magna Cum Laude
                  </pre>
                </div>

                <div className="template-section-item">
                  <div className="section-badge">6. Projects</div>
                  <h5>Key Projects / Portfolio</h5>
                  <p>
                    Include 1 to 3 relevant projects showcasing practical problem solving, tech stack, and links:
                  </p>
                  <pre className="template-code-block">
                    CloudTelemetry: Real-Time Performance Monitor | React, TypeScript, Node.js, Docker
                    • Built open-source telemetry dashboard streaming server metrics over WebSockets.
                  </pre>
                </div>

                <div className="template-section-item">
                  <div className="section-badge">7. Credentials</div>
                  <h5>Certifications & Credentials</h5>
                  <p>
                    List recognized certifications. SkillSync awards bonus compatibility score for verified credentials:
                  </p>
                  <ul>
                    <li>AWS Certified Solutions Architect – Associate (2024)</li>
                    <li>Meta Front-End Developer Professional Certificate (2023)</li>
                    <li>Certified ScrumMaster (CSM) (2022)</li>
                  </ul>
                </div>

                <div className="template-section-item">
                  <div className="section-badge">8. Honors</div>
                  <h5>Honors & Achievements</h5>
                  <p>
                    Conclude with notable hackathon awards, academic distinctions, or employee recognition.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "sample" && (
            <div className="template-sample-preview">
              <div className="sample-resume-sheet">
                <div className="sample-header">
                  <h3>ALEX RIVERA</h3>
                  <div className="sample-subheading">Senior Full Stack Software Engineer</div>
                  <div className="sample-contact-line">
                    Manila, Philippines • +63 917 555 0192 • alex.rivera.dev@example.com • linkedin.com/in/alexrivera-dev • github.com/alexrivera-dev
                  </div>
                </div>

                <div className="sample-section">
                  <div className="sample-sec-title">PROFESSIONAL SUMMARY</div>
                  <p>
                    Results-driven Senior Full Stack Software Engineer with 5+ years of experience architecting, building, and scaling resilient web applications and microservices. Expert in JavaScript, TypeScript, React, Node.js, Python, PostgreSQL, and cloud infrastructure on AWS. Demonstrated track record of leading agile engineering teams, cutting API latencies by 65%, and delivering user-centric digital products serving over 300,000 active users.
                  </p>
                </div>

                <div className="sample-section">
                  <div className="sample-sec-title">CORE SKILLS</div>
                  <div className="sample-skills-grid">
                    <div><strong>Languages:</strong> JavaScript, TypeScript, Python, SQL, HTML, CSS</div>
                    <div><strong>Frameworks:</strong> React, Node.js, Express, Next.js, FastAPI, Tailwind CSS</div>
                    <div><strong>Databases:</strong> PostgreSQL, MySQL, MongoDB, Redis, Supabase</div>
                    <div><strong>Cloud & DevOps:</strong> AWS, Docker, Kubernetes, CI/CD, Git, GitHub, Linux, Nginx</div>
                    <div><strong>Methodologies:</strong> Agile, Scrum, Jira, REST API, GraphQL, System Design, Unit Testing</div>
                  </div>
                </div>

                <div className="sample-section">
                  <div className="sample-sec-title">WORK EXPERIENCE</div>
                  <div className="sample-job">
                    <div className="sample-job-header">
                      <strong>Senior Full Stack Engineer</strong> — NexaTech Cloud Solutions
                      <span className="sample-date">Jan 2023 – Present</span>
                    </div>
                    <ul>
                      <li>Architected and delivered high-performance distributed microservices using React, Node.js, TypeScript, and PostgreSQL serving 300,000+ monthly active users with 99.98% uptime.</li>
                      <li>Built automated containerized CI/CD deployment pipelines using Docker, GitHub Actions, and AWS ECS, reducing deployment cycle times by 45%.</li>
                      <li>Engineered Redis caching layer and optimized relational SQL queries, cutting p99 API response latencies from 650ms to 95ms.</li>
                      <li>Mentored 5 junior and mid-level software engineers in modern TypeScript, clean architecture, and test-driven development.</li>
                    </ul>
                  </div>

                  <div className="sample-job">
                    <div className="sample-job-header">
                      <strong>Full Stack Software Engineer</strong> — MetroScale Technologies
                      <span className="sample-date">Jun 2020 – Dec 2022</span>
                    </div>
                    <ul>
                      <li>Developed responsive single-page candidate matching interfaces using React, Redux, and Tailwind CSS, increasing candidate profile completion rates by 32%.</li>
                      <li>Designed RESTful APIs and asynchronous background task workers using Python, FastAPI, and PostgreSQL with 92% automated test coverage.</li>
                      <li>Collaborated with product managers and UX researchers in bi-weekly agile Scrum sprints to ship 16 production releases on schedule.</li>
                    </ul>
                  </div>
                </div>

                <div className="sample-section">
                  <div className="sample-sec-title">EDUCATION</div>
                  <div className="sample-edu">
                    <strong>Bachelor of Science in Computer Science</strong> — University of the Philippines Diliman
                    <div className="sample-date">Graduated: July 2020 | Magna Cum Laude | GWA: 1.35</div>
                  </div>
                </div>

                <div className="sample-section">
                  <div className="sample-sec-title">KEY PROJECTS</div>
                  <div className="sample-proj">
                    <strong>CloudTelemetry: Real-Time Performance Monitor</strong> (React, TypeScript, Node.js, WebSocket)
                    <p>Created open-source telemetry dashboard streaming server metrics over WebSockets with one-click Docker setup.</p>
                  </div>
                </div>

                <div className="sample-section">
                  <div className="sample-sec-title">CERTIFICATIONS & CREDENTIALS</div>
                  <ul>
                    <li>AWS Certified Solutions Architect – Associate (Amazon Web Services, 2024)</li>
                    <li>Meta Certified Front-End Developer Professional Certificate (Meta, 2023)</li>
                    <li>Certified ScrumMaster (CSM) (Scrum Alliance, 2022)</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {activeTab === "ats" && (
            <div className="template-ats-checklist">
              <h4>SkillSync ATS Optimization Rules</h4>
              <p>Follow these 6 golden rules to ensure your resume scores in the top tier on SkillSync and partner employer portals:</p>

              <div className="ats-rule-grid">
                <div className="ats-rule-card pass">
                  <span className="rule-icon">✅</span>
                  <h5>Single-Column Linear Hierarchy</h5>
                  <p>Keep content in a standard top-to-bottom layout. Multi-column tables, visual splitters, and floating callout boxes disrupt parser reading order.</p>
                </div>
                <div className="ats-rule-card pass">
                  <span className="rule-icon">✅</span>
                  <h5>Recognized Section Headings</h5>
                  <p>Use standard headings: <code>PROFESSIONAL SUMMARY</code>, <code>CORE SKILLS</code>, <code>WORK EXPERIENCE</code>, <code>EDUCATION</code>, <code>CERTIFICATIONS</code>.</p>
                </div>
                <div className="ats-rule-card pass">
                  <span className="rule-icon">✅</span>
                  <h5>Explicit Technical Keyword Matching</h5>
                  <p>Spell out exact technologies (e.g., <em>TypeScript</em>, <em>PostgreSQL</em>, <em>Docker</em>, <em>AWS</em>) so the AI skill dictionary indexes your competencies.</p>
                </div>
                <div className="ats-rule-card pass">
                  <span className="rule-icon">✅</span>
                  <h5>Measurable Impact & Metrics</h5>
                  <p>Highlight results with real numbers: percentages, latency cuts, uptime, user counts, or team sizes. Quantitative evidence elevates candidate match ranking.</p>
                </div>
                <div className="ats-rule-card pass">
                  <span className="rule-icon">✅</span>
                  <h5>Accessible Contact Links</h5>
                  <p>Provide plain text URLs for LinkedIn and GitHub/Portfolio (e.g. <code>linkedin.com/in/username</code>) so contact extraction succeeds even without hyperlinking.</p>
                </div>
                <div className="ats-rule-card pass">
                  <span className="rule-icon">✅</span>
                  <h5>Clean File Export (.docx or .pdf)</h5>
                  <p>Export directly from Microsoft Word, Google Docs, or LibreOffice without graphical flatteners or image-only scans.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer with Download Actions */}
        <div className="template-modal-footer">
          <div className="footer-downloads">
            <a
              href="/templates/SkillSync_ATS_Resume_Template.docx"
              download="SkillSync_ATS_Resume_Template.docx"
              className="template-download-btn primary"
            >
              <span>📄</span> Download Blank Template (.docx)
            </a>
            <a
              href="/templates/SkillSync_Completed_Sample_Resume.docx"
              download="SkillSync_Completed_Sample_Resume.docx"
              className="template-download-btn secondary"
            >
              <span>👤</span> Download Sample (.docx)
            </a>
            <a
              href="/templates/SkillSync_Resume_Writing_Guide.txt"
              download="SkillSync_Resume_Writing_Guide.txt"
              className="template-download-btn outline"
            >
              <span>📖</span> Plain Guide (.txt)
            </a>
          </div>
          <button type="button" className="template-close-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
