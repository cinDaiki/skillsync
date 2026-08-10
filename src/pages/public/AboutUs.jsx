import { Link } from "react-router-dom";
import hansImg from "../../assets/images/team/hans.jpg";
import alexisImg from "../../assets/images/team/alexis.png";
import "./AboutUs.css";

export default function AboutUs() {
  const teamMembers = [
    {
      id: "hans",
      name: "Hans Zachary J. Corbo",
      role: "Lead Programmer",
      education: "4th Year College – BSIT Student",
      school: "Assumption College of Davao",
      image: hansImg,
      alt: "Hans Zachary J. Corbo - Lead Programmer",
      badge: "Software Architecture & Full-Stack Development",
      icon: "💻"
    },
    {
      id: "alexis",
      name: "Alexis P. Albios",
      role: "Technical / Documentation",
      education: "4th Year College – BSIT Student",
      school: "Assumption College of Davao",
      image: alexisImg,
      alt: "Alexis P. Albios - Technical and Documentation",
      badge: "Technical Specs, QA Testing & Systems Documentation",
      icon: "📄"
    }
  ];

  return (
    <main className="about-page">
      {/* ── NAVBAR ────────────────────────────────────────────── */}
      <header className="about-navbar">
        <Link to="/" className="about-brand">
          <span className="about-brand-icon">✓</span>
          <span className="about-brand-text">
            <strong>SkillSync</strong>
            <small>Find the right match</small>
          </span>
        </Link>

        <nav className="about-nav-links">
          <Link to="/">Home</Link>
          <Link to="/browse-jobs">Browse Jobs</Link>
          <Link to="/how-it-works">How it works</Link>
          <Link className="active" to="/about">
            About us
          </Link>
        </nav>

        <div className="about-nav-actions">
          <Link className="about-btn about-btn-outline" to="/sign-in">
            Sign In
          </Link>
          <Link className="about-btn about-btn-pink" to="/sign-up">
            Sign Up
          </Link>
        </div>
      </header>

      {/* ── HERO SECTION ──────────────────────────────────────── */}
      <section className="about-hero">
        <div className="about-hero-inner">
          <div className="about-hero-copy">
            <div className="about-badge-group">
              <span className="about-badge">Assumption College of Davao</span>
              <span className="about-badge-pill">BSIT 4th Year Project</span>
            </div>
            <h1 className="about-hero-title">
              TEAM AC
              <span className="about-hero-sub">Albios × Corbo</span>
            </h1>
            <p className="about-hero-quote">
              "Building SkillSync through technology, collaboration, and innovation."
            </p>
            <p className="about-hero-desc">
              SkillSync was developed by <strong>Team AC</strong> as a software development project at <strong>Assumption College of Davao</strong>. Our mission is to bridge the gap between job seekers and employers through intelligent skill matching, modern UI architecture, and streamlined hiring workflows.
            </p>

            <div className="about-hero-actions">
              <a href="#team-section" className="about-primary-btn">
                Meet the Developers ↓
              </a>
              <Link to="/browse-jobs" className="about-outline-btn">
                Explore Platform
              </Link>
            </div>
          </div>

          <div className="about-hero-branding-card">
            <div className="ac-branding-badge">TEAM IDENTITY</div>
            <div className="ac-letter-breakdown">
              <div className="ac-letter-box">
                <span className="ac-letter">A</span>
                <span className="ac-name">Albios</span>
                <small>Technical / Docs</small>
              </div>
              <span className="ac-multiply">×</span>
              <div className="ac-letter-box">
                <span className="ac-letter">C</span>
                <span className="ac-name">Corbo</span>
                <small>Lead Programmer</small>
              </div>
            </div>
            <div className="ac-school-tag">
              🎓 Assumption College of Davao — BSIT
            </div>
          </div>
        </div>
      </section>

      {/* ── AC BRANDING DEEP DIVE ─────────────────────────────── */}
      <section className="about-ac-identity">
        <div className="about-container">
          <div className="ac-identity-banner">
            <div className="ac-identity-text">
              <h2>The Meaning of <span>Team AC</span></h2>
              <p>
                Representing the collaboration of <strong>Albios</strong> and <strong>Corbo</strong>, Team AC combines technical specification, rigorous documentation, and full-stack software development to engineer SkillSync.
              </p>
            </div>
            <div className="ac-identity-chips">
              <div className="ac-chip">
                <img
                  src={alexisImg}
                  alt="Alexis P. Albios - Technical / Documentation"
                  className="ac-chip-avatar"
                />
                <div>
                  <strong>Alexis P. Albios</strong>
                  <span>Technical / Documentation</span>
                </div>
              </div>
              <div className="ac-chip-divider">×</div>
              <div className="ac-chip">
                <img
                  src={hansImg}
                  alt="Hans Zachary J. Corbo - Lead Programmer"
                  className="ac-chip-avatar"
                />
                <div>
                  <strong>Hans Zachary J. Corbo</strong>
                  <span>Lead Programmer</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── MEET THE TEAM SECTION ─────────────────────────────── */}
      <section id="team-section" className="about-team-section">
        <div className="about-container">
          <div className="about-section-heading center">
            <span className="section-eyebrow">Meet the Team</span>
            <h2>The students behind SkillSync.</h2>
            <p>
              4th Year BSIT Students at Assumption College of Davao dedicated to building modern software solutions.
            </p>
          </div>

          <div className="team-cards-grid">
            {teamMembers.map((member) => (
              <div key={member.id} className="team-member-card">
                <div className="team-card-image-wrap">
                  <img
                    src={member.image}
                    alt={member.alt}
                    className="team-member-img"
                    loading="lazy"
                  />
                  <div className="team-role-badge">
                    <span>{member.icon}</span> {member.role}
                  </div>
                </div>

                <div className="team-card-content">
                  <h3 className="team-member-name">{member.name}</h3>
                  <div className="team-member-role-title">{member.role}</div>

                  <div className="team-member-meta">
                    <div className="meta-item">
                      <span className="meta-icon">🎓</span>
                      <span>{member.education}</span>
                    </div>
                    <div className="meta-item">
                      <span className="meta-icon">🏛️</span>
                      <span>{member.school}</span>
                    </div>
                  </div>

                  <div className="team-member-highlight">
                    <span>Project Role</span>
                    <p>{member.badge}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CALL TO ACTION ────────────────────────────────────── */}
      <section className="about-cta">
        <div className="about-container">
          <div className="about-cta-card">
            <div>
              <span className="about-cta-badge">SkillSync by Team AC</span>
              <h2>Ready to explore the platform?</h2>
              <p>
                Developed at Assumption College of Davao. Create an account or browse jobs to see SkillSync in action.
              </p>
            </div>

            <div className="about-cta-actions">
              <Link to="/sign-up" className="about-primary-btn">
                Create Account
              </Link>
              <Link to="/sign-in" className="about-outline-btn">
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}