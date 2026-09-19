import { Link } from "react-router-dom";
import AuthTransitionLink from "../../../components/common/AuthTransitionLink";

export default function HeroSection() {
  return (
    <section className="hero-section">
      <div className="hero-background-orb orb-one"></div>
      <div className="hero-background-orb orb-two"></div>

      <div className="hero-inner">
        <div className="hero-content">
          <div className="hero-badge">
            <span>✦</span>
            Skill-based job matching platform
          </div>

          <h1>
            Build your career with
            <span> smarter job matching.</span>
          </h1>

          <p>
            SkillSync gives job seekers, employers, and admins a clean workspace
            for resume screening, profile setup, job discovery, and platform.
          </p>

          <div className="hero-buttons">
            <AuthTransitionLink to="/sign-up" type="signup" className="btn btn-primary">
              Get Started
            </AuthTransitionLink>

            <Link to="/browse-jobs" className="btn btn-outline">
              Browse Jobs
            </Link>
          </div>

        </div>

        <div className="hero-visual">
          <div className="visual-card main-panel">
            <div className="panel-header">
              <span></span>
              <span></span>
              <span></span>
            </div>

            <div className="panel-body">
              <div className="panel-title-row">
                <div>
                 <small>Workspace</small>
                    <strong>Career Profile</strong>
                </div>

              </div>

              <div className="profile-block">
                <div className="profile-icon">▤</div>
                <div>
                  <strong>Resume Information</strong>
                  <small>Upload and organize your details</small>
                </div>
              </div>

              <div className="profile-block">
                <div className="profile-icon">◎</div>
                <div>
                  <strong>Skills & Experience</strong>
                  <small>Prepare your profile for matching</small>
                </div>
              </div>

              <div className="profile-block">
                <div className="profile-icon">↗</div>
                <div>
                  <strong>Career Preferences</strong>
                  <small>Set preferred roles and work setup</small>
                </div>
              </div>
            </div>
          </div>

          <div className="visual-ring"></div>
          <div className="visual-dot dot-one"></div>
          <div className="visual-dot dot-two"></div>
        </div>
      </div>
    </section>
  );
}